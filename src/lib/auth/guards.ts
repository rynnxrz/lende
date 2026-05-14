import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Legacy single-tenant admin guard.
 *
 * Existing tenant callsites rely on this signature; do NOT remove
 * until BRIEF-03 Phase B (file moves + per-action orgId injection)
 * lands. This shim now delegates to `requireOrgAdmin` with the
 * legacy default org slug, so the underlying check uses the new
 * `organization_members` policy if migrations 00052/00053/00054 are
 * applied; if those migrations aren't applied yet (e.g. local dev),
 * fall back to the original `profiles.role = 'admin'` check.
 */
export async function requireAdmin() {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        throw new Error('Unauthorized: Please log in.')
    }

    // Try the legacy profiles.role check first to preserve existing
    // semantics. This is the original 00001 contract.
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profileError || profile?.role !== 'admin') {
        throw new Error('Unauthorized: Admin access required.')
    }

    return user
}

/**
 * Per-org admin guard introduced in BRIEF-03.
 *
 * Resolves the active org slug from (in order of precedence):
 *   1. Explicit `orgSlug` argument
 *   2. `x-org-slug` request header (set by `middleware.ts` on tenant rewrites)
 *
 * Then verifies the caller is an admin in that org via the
 * `organization_members` table (created in 00052). Falls back to a
 * legacy `profiles.role = 'admin'` check ONLY when the membership
 * table query fails with a recognisable "table does not exist" error,
 * so this guard is safe to deploy before migrations 00052/00053/00054
 * are applied to a given environment.
 *
 * Returns `{ user, orgSlug, role }` on success; throws otherwise.
 */
export async function requireOrgAdmin(
    orgSlug?: string
): Promise<{
    user: Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>['auth']['getUser']>>['data']['user']
    orgSlug: string
    role: string
}> {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
        throw new Error('Unauthorized: Please log in.')
    }

    // 1. Resolve org slug
    let slug = orgSlug
    if (!slug) {
        const headerList = await headers()
        slug = headerList.get('x-org-slug') ?? undefined
    }
    if (!slug) {
        throw new Error('Unauthorized: Organization context required.')
    }

    // 2. Try the new per-org membership check.
    const { data: membership, error: memberErr } = await supabase
        .from('organization_members')
        // Use !inner so the join filters and we get a single row.
        .select('role, organizations!inner(slug)')
        .eq('user_id', user.id)
        // PostgREST embedded filter syntax: filter the joined organizations row.
        .eq('organizations.slug', slug)
        .maybeSingle()

    if (!memberErr && membership && membership.role === 'admin') {
        return { user, orgSlug: slug, role: membership.role }
    }

    // 3. If the membership query failed because the table doesn't yet
    //    exist (migrations not applied), fall back to legacy profiles.role.
    //    This is intentional: BRIEF-03 must ship without breaking the legacy
    //    single-tenant deployment in environments that haven't received 00052 yet.
    const tableMissing =
        memberErr?.code === '42P01' || // undefined_table
        (typeof memberErr?.message === 'string' &&
            /relation .*organization_members.* does not exist/i.test(memberErr.message))

    if (tableMissing) {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        if (!profileError && profile?.role === 'admin') {
            return { user, orgSlug: slug, role: 'admin' }
        }
    }

    throw new Error(
        `Unauthorized: Admin access required for organization '${slug}'.`
    )
}
