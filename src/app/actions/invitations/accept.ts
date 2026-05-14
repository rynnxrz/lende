'use server'

import { headers } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { track } from '@/lib/analytics/track'
import { sendOnboardingDay0 } from '@/lib/email/onboarding'

/**
 * BRIEF-59 — multi-org accept extension.
 *
 * acceptInvitationAction now handles two modes:
 *   - mode='new'      : email has no auth.users row yet. createUser →
 *                       sign-in → atomic accept → stamp current_org_id
 *                       → refreshSession.
 *   - mode='existing' : email already has an account (the user is
 *                       joining a *second* org). signInWithPassword
 *                       with the user's *existing* password (never
 *                       accept token-only — risk #1 mitigation) →
 *                       atomic accept under their existing user_id →
 *                       set_active_organization → stamp current_org_id
 *                       → refreshSession.
 *
 * The branches share `refreshAndStampOrg` to guarantee that
 * `app_metadata.current_org_id` is set + the JWT is refreshed at the
 * end of every successful path. Skipping that step recreates the
 * BRIEF-42 S5 bug (RLS denies everything because the token has no
 * org claim).
 */

export type AcceptInvitationMode = 'new' | 'existing'

export interface AcceptInvitationInput {
    token: string
    mode: AcceptInvitationMode
    /** Required when mode='new'. Min 8 chars. */
    password?: string
    /**
     * Required when mode='existing'. The user's *current* password —
     * we re-authenticate before adding them to the new org. This is
     * the BRIEF-59 risk #1 mitigation: we never let a stolen
     * invitation token alone enrol a real user into a new org.
     */
    existingPassword?: string
}

export type AcceptInvitationResult =
    | { ok: true; slug: string; orgName: string }
    | { ok: false; error: string }

interface InvitationRow {
    id: string
    organization_id: string
    email: string
    role: string
    expires_at: string
    accepted_at: string | null
    invited_by: string | null
}

interface OrgRow {
    slug: string
    name: string
}

/**
 * BRIEF-59 — single helper called at the end of every successful
 * accept branch. Stamping current_org_id and refreshing the JWT must
 * happen in this order, on every path. Bug-class fix for risk #3.
 */
async function refreshAndStampOrg(
    cookieClient: SupabaseClient,
    userId: string,
    orgId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const service = createServiceClient()

    const { error: stampError } = await service.auth.admin.updateUserById(userId, {
        app_metadata: { current_org_id: orgId },
    })
    if (stampError) {
        return { ok: false, error: stampError.message }
    }

    const { error: refreshError } = await cookieClient.auth.refreshSession()
    if (refreshError) {
        return { ok: false, error: refreshError.message }
    }

    return { ok: true }
}

/**
 * BRIEF-59 — look up auth.users by email via the admin API. Returns
 * whether a row exists + that user's id when found. Service-role only.
 *
 * Exported so /invite/[token]/page.tsx can render the dual-mode UI
 * (mode='existing' when the email already has an account).
 *
 * The Supabase JS admin SDK doesn't yet expose `getUserByEmail`, so
 * we use `listUsers` with a small page and filter client-side. This
 * matches the Supabase recommended pattern for this lookup.
 */
export async function existingUserExists(
    email: string,
): Promise<{ exists: boolean; userId?: string }> {
    const service = createServiceClient()
    const normalised = email.trim().toLowerCase()
    const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error || !data) return { exists: false }
    const match = data.users.find((u) => u.email?.toLowerCase() === normalised)
    return match ? { exists: true, userId: match.id } : { exists: false }
}

export async function acceptInvitationAction(
    input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
    const { token, mode } = input

    if (!token || token.length < 16) {
        return { ok: false, error: 'Invalid invitation link.' }
    }

    if (mode === 'new') {
        if (!input.password || input.password.length < 8) {
            return { ok: false, error: 'Password must be at least 8 characters.' }
        }
    } else if (mode === 'existing') {
        if (!input.existingPassword) {
            return {
                ok: false,
                error: 'Enter your current password to join the new organization.',
            }
        }
    } else {
        return { ok: false, error: 'Invalid mode.' }
    }

    const service = createServiceClient()

    // 1. Look up invitation by token
    const { data: invitation, error: invError } = await service
        .from('organization_invitations')
        .select('id, organization_id, email, role, expires_at, accepted_at, invited_by')
        .eq('token', token)
        .single<InvitationRow>()

    if (invError || !invitation) {
        return { ok: false, error: 'This invitation link is invalid or has already been used.' }
    }

    if (invitation.accepted_at) {
        return { ok: false, error: 'This invitation has already been accepted.' }
    }

    if (new Date(invitation.expires_at) < new Date()) {
        return {
            ok: false,
            error: 'This invitation has expired. Please ask your admin for a new one.',
        }
    }

    // 2. Get org details for redirect
    const { data: org } = await service
        .from('organizations')
        .select('slug, name')
        .eq('id', invitation.organization_id)
        .single<OrgRow>()

    if (!org) {
        return { ok: false, error: 'The organization for this invitation no longer exists.' }
    }

    // 3. Source IP for audit log (best-effort — null when behind a
    //    proxy that strips the header).
    let sourceIp: string | null = null
    try {
        const hdrs = await headers()
        sourceIp =
            hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            hdrs.get('x-real-ip') ??
            null
    } catch {
        sourceIp = null
    }

    // ─────────────────────────────────────────────────────────────────
    // Branch on mode
    // ─────────────────────────────────────────────────────────────────
    const cookieClient = await createClient()

    if (mode === 'existing') {
        return acceptAsExistingUser({
            invitation,
            org,
            existingPassword: input.existingPassword!,
            cookieClient,
            sourceIp,
        })
    }

    return acceptAsNewUser({
        invitation,
        org,
        password: input.password!,
        cookieClient,
        sourceIp,
    })
}

async function acceptAsNewUser(args: {
    invitation: InvitationRow
    org: OrgRow
    password: string
    cookieClient: SupabaseClient
    sourceIp: string | null
}): Promise<AcceptInvitationResult> {
    const { invitation, org, password, cookieClient, sourceIp } = args
    const service = createServiceClient()

    // 4a. Create auth user via admin API (invitation proves email
    //     ownership)
    const { data: createData, error: createError } = await service.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        user_metadata: { invited_to_org: org.slug },
    })

    if (createError) {
        if (/already.*registered/i.test(createError.message)) {
            return {
                ok: false,
                error:
                    'An account with this email already exists. Sign in below using your existing password to join this organization.',
            }
        }
        return { ok: false, error: createError.message }
    }

    const userId = createData.user?.id
    if (!userId) {
        return { ok: false, error: 'Account creation succeeded but no user ID was returned.' }
    }

    // 5a. Sign in so the browser gets a session cookie
    const { error: signInError } = await cookieClient.auth.signInWithPassword({
        email: invitation.email,
        password,
    })

    if (signInError) {
        await service.auth.admin.deleteUser(userId)
        return { ok: false, error: 'Account created but sign-in failed. Please try logging in.' }
    }

    // 6a. Atomic: INSERT membership + UPDATE invitation + UPDATE
    //      profile + INSERT audit row (BRIEF-59 RPC v2)
    const { error: rpcError } = await cookieClient.rpc('accept_invitation_atomic', {
        p_invitation_id: invitation.id,
        p_user_id: userId,
        p_organization_id: invitation.organization_id,
        p_role: invitation.role,
        p_invited_by: invitation.invited_by ?? null,
        p_mode: 'new',
        p_source_ip: sourceIp,
    })

    if (rpcError) {
        // F2: rollback auth user if RPC fails to prevent stuck state
        await service.auth.admin.deleteUser(userId)
        return { ok: false, error: `Could not join organization: ${rpcError.message}` }
    }

    // 7a. Stamp current_org_id + refresh JWT (shared helper)
    const refresh = await refreshAndStampOrg(cookieClient, userId, invitation.organization_id)
    if (!refresh.ok) {
        return { ok: false, error: `Joined but session refresh failed: ${refresh.error}` }
    }

    // 8a. Analytics + day-0 email
    track('signup_completed', {
        user_id: userId,
        organization_id: invitation.organization_id,
        method: 'invitation',
    })

    await sendOnboardingDay0({
        toEmail: invitation.email,
        orgName: org.name,
        adminUrl: `/${org.slug}/admin`,
    })

    return { ok: true, slug: org.slug, orgName: org.name }
}

async function acceptAsExistingUser(args: {
    invitation: InvitationRow
    org: OrgRow
    existingPassword: string
    cookieClient: SupabaseClient
    sourceIp: string | null
}): Promise<AcceptInvitationResult> {
    const { invitation, org, existingPassword, cookieClient, sourceIp } = args
    const service = createServiceClient()

    // 4b. Look up the user. We do this *after* validating the token so
    //     attackers don't get a free email-existence oracle out of an
    //     invalid invitation link.
    const { exists, userId } = await existingUserExists(invitation.email)
    if (!exists || !userId) {
        return {
            ok: false,
            error:
                'We couldn\'t find an existing account for this email. Try the "Set a password" flow above instead.',
        }
    }

    // 5b. Re-authenticate with the user's *existing* password. This is
    //     the BRIEF-59 risk #1 mitigation: invitation token alone is
    //     never sufficient to enrol a real user into a new org.
    const { error: signInError } = await cookieClient.auth.signInWithPassword({
        email: invitation.email,
        password: existingPassword,
    })

    if (signInError) {
        return {
            ok: false,
            error: "That password doesn't match the account on file. Try again or reset your password.",
        }
    }

    // 6b. Atomic accept under the existing user's id (RPC v2 with
    //      p_mode='existing' for audit-log differentiation).
    const { error: rpcError } = await cookieClient.rpc('accept_invitation_atomic', {
        p_invitation_id: invitation.id,
        p_user_id: userId,
        p_organization_id: invitation.organization_id,
        p_role: invitation.role,
        p_invited_by: invitation.invited_by ?? null,
        p_mode: 'existing',
        p_source_ip: sourceIp,
    })

    if (rpcError) {
        // No createUser to roll back. Surface the error.
        return { ok: false, error: `Could not join organization: ${rpcError.message}` }
    }

    // 7b. Switch active org to the newly-joined one. set_active_organization
    //      (00054) updates profiles.last_active_org_id, which the JWT
    //      hook reads on the next refresh. We still call updateUserById +
    //      refreshSession via refreshAndStampOrg so the *current*
    //      access token is refreshed immediately.
    const { error: setActiveError } = await cookieClient.rpc('set_active_organization', {
        p_org_id: invitation.organization_id,
    })
    if (setActiveError) {
        // Non-fatal — membership is already in place. The user can
        // switch via the org picker. Surface for visibility but do
        // not abort.
        // eslint-disable-next-line no-console
        console.warn(
            '[accept:existing] set_active_organization soft-failed:',
            setActiveError.message,
        )
    }

    // 8b. Stamp current_org_id + refresh JWT (shared helper)
    const refresh = await refreshAndStampOrg(cookieClient, userId, invitation.organization_id)
    if (!refresh.ok) {
        return { ok: false, error: `Joined but session refresh failed: ${refresh.error}` }
    }

    // 9b. Analytics. We deliberately do *not* re-send the day-0
    //     onboarding email — this isn't an onboarding event; the user
    //     is already active on a different org.
    track('signup_completed', {
        user_id: userId,
        organization_id: invitation.organization_id,
        method: 'invitation_existing_user',
    })

    return { ok: true, slug: org.slug, orgName: org.name }
}

export async function getInvitationByToken(token: string): Promise<{
    email: string
    orgName: string
    role: string
    expired: boolean
    accepted: boolean
    /** BRIEF-59 — true if an auth.users row already exists for this email. */
    existingUser: boolean
} | null> {
    if (!token || token.length < 16) return null

    const service = createServiceClient()

    const { data: invitation } = await service
        .from('organization_invitations')
        .select('email, role, expires_at, accepted_at, organization_id')
        .eq('token', token)
        .single<{
            email: string
            role: string
            expires_at: string
            accepted_at: string | null
            organization_id: string
        }>()

    if (!invitation) return null

    const { data: org } = await service
        .from('organizations')
        .select('name')
        .eq('id', invitation.organization_id)
        .single<{ name: string }>()

    // Probe for an existing user only if the invitation is still
    // actionable. Avoids leaking email-existence on stale links.
    const stillActionable =
        !invitation.accepted_at && new Date(invitation.expires_at) >= new Date()
    const userProbe = stillActionable
        ? await existingUserExists(invitation.email)
        : { exists: false }

    return {
        email: invitation.email,
        orgName: org?.name ?? 'Unknown',
        role: invitation.role,
        expired: new Date(invitation.expires_at) < new Date(),
        accepted: !!invitation.accepted_at,
        existingUser: userProbe.exists,
    }
}
