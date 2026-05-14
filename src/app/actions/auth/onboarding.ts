'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * BRIEF-05 — Onboarding step persistence server actions.
 *
 * State lives on `organizations.settings` JSONB so we don't need a
 * new migration:
 *
 *   {
 *     ...,
 *     onboarding: {
 *       step: 1 | 2 | 3 | 4,
 *       completed_at: ISO | null,
 *       step_payloads: {
 *         '1': { logoFileName?: string },
 *         '2': { currency, turnaroundDays, contactEmail },
 *         '3': { method: 'manual' | 'smart_import' | 'skip' },
 *       }
 *     }
 *   }
 *
 * Both actions verify the caller is a member of the org before writing
 * (RLS would also catch it, but failing fast with a clearer error is
 * friendlier).
 */

async function getCallerAndOrgId(orgSlug: string): Promise<
    { ok: true; userId: string; orgId: string } | { ok: false; error: string }
> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Not authenticated.' }

    const service = createServiceClient()
    const { data: org } = await service
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { ok: false, error: 'Organization not found.' }

    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!member) return { ok: false, error: 'Not a member of this organization.' }

    return { ok: true, userId: user.id, orgId: org.id as string }
}

export async function saveOnboardingStepAction(args: {
    orgSlug: string
    step: number
    payload?: Record<string, unknown>
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const guard = await getCallerAndOrgId(args.orgSlug)
    if (!guard.ok) return guard

    const service = createServiceClient()
    const { data: existing } = await service
        .from('organizations')
        .select('settings')
        .eq('id', guard.orgId)
        .single()

    const settings = (existing?.settings ?? {}) as Record<string, unknown>
    const onboarding = (settings.onboarding ?? {}) as Record<string, unknown>
    const stepPayloads = (onboarding.step_payloads ?? {}) as Record<string, unknown>

    if (args.payload) {
        stepPayloads[String(args.step)] = args.payload
    }
    onboarding.step_payloads = stepPayloads
    onboarding.step = args.step
    settings.onboarding = onboarding

    const { error } = await service
        .from('organizations')
        .update({ settings })
        .eq('id', guard.orgId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}

export async function finishOnboardingAction(args: { orgSlug: string }): Promise<
    { ok: true } | { ok: false; error: string }
> {
    const guard = await getCallerAndOrgId(args.orgSlug)
    if (!guard.ok) return guard

    const service = createServiceClient()
    const { data: existing } = await service
        .from('organizations')
        .select('settings')
        .eq('id', guard.orgId)
        .single()

    const settings = (existing?.settings ?? {}) as Record<string, unknown>
    const onboarding = (settings.onboarding ?? {}) as Record<string, unknown>
    onboarding.completed_at = new Date().toISOString()
    onboarding.step = 4
    settings.onboarding = onboarding

    const { error } = await service
        .from('organizations')
        .update({ settings })
        .eq('id', guard.orgId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}
