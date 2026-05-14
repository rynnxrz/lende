'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * BRIEF-60 — set the user's active org and refresh their JWT so
 * `app_metadata.current_org_id` (00054 hook) reflects the chosen org
 * on the very next request. Mirrors the `refreshAndStampOrg` pattern
 * in src/app/actions/invitations/accept.ts (BRIEF-59).
 *
 * Usage from /select-workspace/page.tsx:
 *   const res = await setActiveOrgAndRedirectAction(orgId)
 *   if (res.ok) router.push(`/${res.slug}/admin`)
 *
 * The function:
 *   1. Verifies the caller is authenticated and a member of the chosen
 *      org (defence-in-depth — RLS would reject anyway).
 *   2. Calls the SECURITY DEFINER `set_active_organization` RPC, which
 *      updates `profiles.last_active_org_id`.
 *   3. Stamps `app_metadata.current_org_id` (service role) so the next
 *      hook fire reads the new value.
 *   4. Calls `auth.refreshSession()` so the cookie carries the new
 *      JWT immediately (BRIEF-42 S5 fix).
 */

export interface SetActiveOrgResult {
    ok: boolean
    slug?: string
    error?: string
}

export async function setActiveOrgAndRedirectAction(
    organizationId: string,
): Promise<SetActiveOrgResult> {
    if (!organizationId || typeof organizationId !== 'string') {
        return { ok: false, error: 'Invalid workspace id.' }
    }

    const cookieClient = await createClient()
    const {
        data: { user },
        error: userError,
    } = await cookieClient.auth.getUser()
    if (userError || !user) {
        return { ok: false, error: 'You must be signed in.' }
    }

    const service = createServiceClient()

    // Membership check + slug lookup in one round trip.
    const { data: membership, error: memberError } = await service
        .from('organization_members')
        .select('role, organizations!inner(slug)')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .maybeSingle()
    if (memberError || !membership) {
        return { ok: false, error: 'You are not a member of that workspace.' }
    }
    const slug = (membership as { organizations?: { slug?: string } }).organizations?.slug
    if (!slug) {
        return { ok: false, error: 'Workspace has no slug; please contact support.' }
    }

    // 1. set_active_organization RPC (00054) — updates
    //    profiles.last_active_org_id.
    const { error: rpcError } = await cookieClient.rpc('set_active_organization', {
        p_org_id: organizationId,
    })
    if (rpcError) {
        return { ok: false, error: rpcError.message }
    }

    // 2. Stamp app_metadata.current_org_id immediately so the hook on
    //    the next refreshSession picks it up — even if last_active_org_id
    //    fallback logic is still warming.
    const { error: stampError } = await service.auth.admin.updateUserById(user.id, {
        app_metadata: { current_org_id: organizationId },
    })
    if (stampError) {
        return { ok: false, error: stampError.message }
    }

    // 3. Refresh the JWT.
    const { error: refreshError } = await cookieClient.auth.refreshSession()
    if (refreshError) {
        return { ok: false, error: refreshError.message }
    }

    return { ok: true, slug }
}
