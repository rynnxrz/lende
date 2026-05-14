'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendTrialExtendedEmail } from '@/lib/email/trial-extended'
import { revalidatePath } from 'next/cache'

/**
 * BRIEF-61 admin-way step 4 — four per-row actions backed by RPCs in
 * migration 00066. Each action gates on the SYSTEM_ADMIN_EMAILS list
 * (mirrored from page.tsx) before calling the RPC, so a stray client
 * cannot bypass middleware by hitting the action directly.
 */

const SYSTEM_ADMIN_EMAILS = new Set<string>([
    'rongze.work@gmail.com',
])

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }

async function ensureSystemAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email || !SYSTEM_ADMIN_EMAILS.has(user.email)) {
        return { ok: false, error: 'Not authorized.' }
    }
    return { ok: true, userId: user.id }
}

/**
 * Extend an org's trial by N days (typically 7).
 * Sends the org owner a "we extended your trial" Resend email.
 */
export async function extendTrialAction(args: {
    orgId: string
    days: number
}): Promise<Result<{ newTrialEndsAt: string }>> {
    const guard = await ensureSystemAdmin()
    if (!guard.ok) return guard
    if (!Number.isInteger(args.days) || args.days < 1 || args.days > 90) {
        return { ok: false, error: 'days must be between 1 and 90' }
    }

    const service = createServiceClient()
    const { data, error } = await service.rpc('extend_trial', {
        p_org_id: args.orgId,
        p_days: args.days,
    })
    if (error) {
        return { ok: false, error: error.message }
    }

    // Best-effort: notify org owner. Failing the email does not roll back the
    // trial extension (DB row is the source of truth).
    try {
        const { data: org } = await service
            .from('organizations')
            .select('name, slug')
            .eq('id', args.orgId)
            .single()

        const { data: ownerRow } = await service
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', args.orgId)
            .eq('role', 'owner')
            .limit(1)
            .single()

        if (ownerRow && org) {
            const { data: profile } = await service
                .from('profiles')
                .select('email, full_name')
                .eq('id', ownerRow.user_id)
                .single()

            if (profile?.email) {
                await sendTrialExtendedEmail({
                    toEmail: profile.email,
                    ownerName: profile.full_name ?? null,
                    orgName: org.name,
                    orgSlug: org.slug,
                    days: args.days,
                    newTrialEndsAt: String(data),
                })
            }
        }
    } catch (err) {
        console.error('[extendTrialAction] notify owner failed', err)
    }

    revalidatePath('/system-admin/orgs')
    return { ok: true, data: { newTrialEndsAt: String(data) } }
}

/**
 * Mark org as paid (manual conversion). Caller passes the Lemon Squeezy
 * subscription id (or a placeholder for invoice flow).
 */
export async function convertToPaidAction(args: {
    orgId: string
    subscriptionId: string
}): Promise<Result> {
    const guard = await ensureSystemAdmin()
    if (!guard.ok) return guard
    const trimmed = (args.subscriptionId ?? '').trim()
    if (trimmed.length === 0) {
        return { ok: false, error: 'subscriptionId is required' }
    }

    const service = createServiceClient()
    const { error } = await service.rpc('set_subscription_active', {
        p_org_id: args.orgId,
        p_subscription_id: trimmed,
    })
    if (error) {
        return { ok: false, error: error.message }
    }

    revalidatePath('/system-admin/orgs')
    return { ok: true }
}

/**
 * Deactivate org (subscription_status='cancelled'). Data preserved 90 days.
 */
export async function deactivateOrgAction(args: {
    orgId: string
    reason: string
}): Promise<Result> {
    const guard = await ensureSystemAdmin()
    if (!guard.ok) return guard
    const trimmed = (args.reason ?? '').trim()
    if (trimmed.length < 3) {
        return { ok: false, error: 'reason is required (>= 3 chars)' }
    }

    const service = createServiceClient()
    const { error } = await service.rpc('deactivate_org', {
        p_org_id: args.orgId,
        p_reason: trimmed,
    })
    if (error) {
        return { ok: false, error: error.message }
    }

    revalidatePath('/system-admin/orgs')
    return { ok: true }
}

/**
 * Record that Rongze opened the compose for a personal email. The mailto:
 * launches client-side; this action only writes the audit row so the
 * dashboard / weekly digest can see "I emailed acme-jewelry on day 9".
 */
export async function sendPersonalEmailAction(args: {
    orgId: string
    templateKey: 'check_in' | 'feature_suggestion' | 'extension_offer' | 'custom'
}): Promise<Result> {
    const guard = await ensureSystemAdmin()
    if (!guard.ok) return guard

    const service = createServiceClient()
    const { error } = await service.rpc('log_personal_email', {
        p_org_id: args.orgId,
        p_template_key: args.templateKey,
    })
    if (error) {
        return { ok: false, error: error.message }
    }

    revalidatePath('/system-admin/orgs')
    return { ok: true }
}

/**
 * Bulk fetch engagement scores for many orgs in parallel.
 * Used by page.tsx so the dashboard renders a single round-trip.
 */
export async function fetchEngagementScores(
    orgIds: string[]
): Promise<Record<string, number>> {
    if (orgIds.length === 0) return {}
    const service = createServiceClient()
    const out: Record<string, number> = {}
    const settled = await Promise.allSettled(
        orgIds.map(async id => {
            const { data, error } = await service.rpc('engagement_score', { p_org_id: id })
            if (error) {
                console.error('[fetchEngagementScores] rpc error', id, error.message)
                return [id, 0] as const
            }
            const num = typeof data === 'number' ? data : Number(data ?? 0)
            return [id, Number.isFinite(num) ? num : 0] as const
        })
    )
    for (const r of settled) {
        if (r.status === 'fulfilled') {
            const [id, score] = r.value
            out[id] = score
        }
    }
    return out
}
