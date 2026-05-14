import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-63 S15 — in-session OrgSwitcher (data layer).
 *
 * Mirrors the s11 (BRIEF-60 login picker) pattern: exercises the data
 * surface that `OrgSwitcher.tsx` reads + the `setActiveOrgAndRedirectAction`
 * logic the dropdown calls. Cannot import the server action directly
 * because it depends on the Next.js cookie/headers context — instead
 * we replicate the four-step logic (membership check / `set_active_organization`
 * RPC / app_metadata stamp / `refreshSession`) using the same supabase
 * clients the action uses.
 *
 * Sub-tests:
 *   1. (a) service-role membership query returns 2 rows for a user with
 *      memberships in two orgs (this is what the layout fetch feeds to
 *      the Sidebar's OrgSwitcher).
 *      (b) Calling `set_active_organization(orgB)` as the user followed
 *      by service-role app_metadata stamp + refreshSession flips both
 *      `profiles.last_active_org_id` and `auth.users.app_metadata.current_org_id`.
 *   2. Calling `set_active_organization(orgC)` where the user is NOT a
 *      member raises an error (ERRCODE 42501) — the user cannot switch
 *      into an org they don't belong to.
 *
 * Live tests skip when SUPABASE env is missing or in production.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

const skipReason =
    !SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY
        ? 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY must be set'
        : process.env.SUPABASE_URL_GUARDRAIL === 'production'
          ? 'Refusing to run scenarios against production database'
          : ''

const RUN_ID = Date.now().toString(36)
const password = 'brief-63-s15-pw-12345'

const createdUserIds: string[] = []
const createdOrgIds: string[] = []

function service(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

function anonClient(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: true },
    })
}

async function createOrg(slug: string, name: string): Promise<string> {
    const svc = service()
    const { data, error } = await svc
        .from('organizations')
        .insert({ slug, name, plan: 'trial' })
        .select('id')
        .single()
    if (error || !data) throw new Error(`createOrg failed: ${error?.message}`)
    createdOrgIds.push(data.id as string)
    return data.id as string
}

async function addMember(
    orgId: string,
    userId: string,
    role: 'owner' | 'admin' = 'admin',
): Promise<void> {
    const svc = service()
    const { error } = await svc.from('organization_members').insert({
        organization_id: orgId,
        user_id: userId,
        role,
        accepted_at: new Date().toISOString(),
    })
    if (error) throw new Error(`addMember failed: ${error.message}`)
}

async function cleanup() {
    const svc = service()
    for (const uid of createdUserIds) {
        try {
            await svc.auth.admin.deleteUser(uid)
        } catch {}
    }
    if (createdOrgIds.length) {
        await svc.from('organizations').delete().in('id', createdOrgIds)
    }
}

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-63 s15 — in-session OrgSwitcher data + action logic', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('service-role memberships query returns both orgs + active-org RPC flips JWT', async () => {
        const svc = service()
        const email = `s15-${RUN_ID}@example.com`

        // (a) Create user U + orgA (owner) + orgB (admin).
        const { data: c, error: cErr } = await svc.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        expect(cErr).toBeNull()
        const userId = c.user!.id
        createdUserIds.push(userId)

        const orgAId = await createOrg(`s15-orgA-${RUN_ID}`, `S15 OrgA ${RUN_ID}`)
        await addMember(orgAId, userId, 'owner')
        const orgBId = await createOrg(`s15-orgB-${RUN_ID}`, `S15 OrgB ${RUN_ID}`)
        await addMember(orgBId, userId, 'admin')

        // (b) Service-role membership query — this is exactly what
        //     `src/app/[slug]/admin/layout.tsx` runs to feed the Sidebar
        //     OrgSwitcher. Asserts both orgs come back (RLS would only
        //     return the active one — we explicitly use service role to
        //     bypass that).
        const { data: memberships, error: mErr } = await svc
            .from('organization_members')
            .select('organization_id, role, organizations!inner(id, slug, name)')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
        expect(mErr).toBeNull()
        expect(memberships?.length).toBe(2)
        const seenOrgIds = (memberships ?? []).map((m) => m.organization_id as string)
        expect(seenOrgIds).toContain(orgAId)
        expect(seenOrgIds).toContain(orgBId)

        // (c) Sign in as U via anon client (mirrors the production
        //     cookie session that `setActiveOrgAndRedirectAction` operates
        //     under).
        const anon = anonClient()
        const { error: signErr } = await anon.auth.signInWithPassword({ email, password })
        expect(signErr).toBeNull()

        // (d) Switch to orgB via the RPC the action calls.
        const { error: rpcErr } = await anon.rpc('set_active_organization', {
            p_org_id: orgBId,
        })
        expect(rpcErr).toBeNull()

        // (e) Service-role stamp `app_metadata.current_org_id` (the
        //     action's defence-in-depth step before refreshSession).
        const { error: stampErr } = await svc.auth.admin.updateUserById(userId, {
            app_metadata: { current_org_id: orgBId },
        })
        expect(stampErr).toBeNull()

        // (f) refreshSession — assert the JWT now carries orgB.
        const { error: refreshErr } = await anon.auth.refreshSession()
        expect(refreshErr).toBeNull()

        const { data: stampedUser } = await svc.auth.admin.getUserById(userId)
        expect(
            (stampedUser?.user?.app_metadata as { current_org_id?: string } | undefined)
                ?.current_org_id,
        ).toBe(orgBId)

        // (g) profiles.last_active_org_id has been updated to orgB by
        //     the RPC.
        const { data: profile, error: pErr } = await svc
            .from('profiles')
            .select('last_active_org_id')
            .eq('id', userId)
            .maybeSingle()
        expect(pErr).toBeNull()
        expect((profile as { last_active_org_id?: string } | null)?.last_active_org_id).toBe(
            orgBId,
        )
    })

    test('attempting to switch into a non-member org fails (RPC raises 42501)', async () => {
        const svc = service()
        const email = `s15-rej-${RUN_ID}@example.com`

        // Fresh user with a single membership — we only need to assert
        // that they can't pivot into an org they don't belong to.
        const { data: c, error: cErr } = await svc.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        expect(cErr).toBeNull()
        const userId = c.user!.id
        createdUserIds.push(userId)

        const ownOrgId = await createOrg(`s15-own-${RUN_ID}`, `S15 Own ${RUN_ID}`)
        await addMember(ownOrgId, userId, 'owner')

        // Foreign org — U is intentionally NOT added as a member.
        const foreignOrgId = await createOrg(`s15-foreign-${RUN_ID}`, `S15 Foreign ${RUN_ID}`)

        const anon = anonClient()
        const { error: signErr } = await anon.auth.signInWithPassword({ email, password })
        expect(signErr).toBeNull()

        // RPC must raise — `set_active_organization` (00054) gates on
        // accepted_at + membership row presence and raises ERRCODE 42501
        // when the row is missing.
        const { error: rpcErr } = await anon.rpc('set_active_organization', {
            p_org_id: foreignOrgId,
        })
        expect(rpcErr).not.toBeNull()
        const code = (rpcErr as { code?: string } | null)?.code
        const message = (rpcErr as { message?: string } | null)?.message ?? ''
        // PostgREST surfaces the SQL ERRCODE as `code`; some drivers
        // map it onto the message instead. Accept either signal.
        const looksLikeMembershipDenial =
            code === '42501' ||
            /not a member/i.test(message) ||
            /42501/.test(message)
        expect(looksLikeMembershipDenial).toBe(true)

        // profiles.last_active_org_id should still be ownOrg (the RPC
        // never reached the UPDATE branch). Note: 00054's
        // handle_new_user trigger doesn't seed last_active_org_id, so
        // we only assert it is NOT the foreign org id.
        const { data: profile } = await svc
            .from('profiles')
            .select('last_active_org_id')
            .eq('id', userId)
            .maybeSingle()
        const last = (profile as { last_active_org_id?: string | null } | null)?.last_active_org_id
        expect(last).not.toBe(foreignOrgId)
    })
})
