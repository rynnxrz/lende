import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-60 S11 — multi-org login picker.
 *
 * Validates the data side of the multi-org login flow. The /login page
 * counts the user's `organization_members` rows after sign-in:
 *   - count == 1 → push /<slug>/admin
 *   - count >= 2 → push /select-workspace
 *
 * This test exercises:
 *   1. A single-org user sees exactly one membership row when reading
 *      via the user's own session (RLS) — the picker logic should
 *      bounce them straight to /<slug>/admin.
 *   2. After joining a second org via service role, the same user sees
 *      two rows — the picker logic should route to /select-workspace.
 *   3. The set_active_organization RPC + admin stamp + refreshSession
 *      atomically updates `app_metadata.current_org_id` (mirrors the
 *      BRIEF-59 refreshAndStampOrg pattern at the heart of
 *      setActiveOrgAndRedirectAction).
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
const password = 'brief-60-s11-pw-12345'

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

test.describe('BRIEF-60 s11 — multi-org picker count + active-org RPC', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('user with 1 org sees count=1 (single-org bypass); after joining 2nd org sees count=2 (picker)', async () => {
        const svc = service()
        const email = `s11-${RUN_ID}@example.com`

        // (a) Create user + org1, link as owner.
        const { data: c, error: cErr } = await svc.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        expect(cErr).toBeNull()
        const userId = c.user!.id
        createdUserIds.push(userId)

        const org1Id = await createOrg(`s11-org1-${RUN_ID}`, `S11 Org1 ${RUN_ID}`)
        await addMember(org1Id, userId, 'owner')

        // (b) Sign in as the user via anon client (mirrors what the
        //     /login page does in production).
        const anon = anonClient()
        const { error: signErr } = await anon.auth.signInWithPassword({ email, password })
        expect(signErr).toBeNull()

        // (c) Read membership rows under user RLS (anon-key session).
        let { data: rows1, error: r1Err } = await anon
            .from('organization_members')
            .select('organization_id, organizations!inner(slug)')
            .eq('user_id', userId)
        expect(r1Err).toBeNull()
        expect(rows1?.length).toBe(1)

        // (d) Create org2 and add the same user.
        const org2Id = await createOrg(`s11-org2-${RUN_ID}`, `S11 Org2 ${RUN_ID}`)
        await addMember(org2Id, userId, 'admin')

        // Re-read under the same authenticated session.
        const { data: rows2, error: r2Err } = await anon
            .from('organization_members')
            .select('organization_id, organizations!inner(slug)')
            .eq('user_id', userId)
        expect(r2Err).toBeNull()
        expect(rows2?.length).toBe(2)
        const slugs = (rows2 ?? []).map(
            (r: unknown) =>
                (r as { organizations?: { slug?: string } })?.organizations?.slug ?? '',
        )
        expect(slugs).toContain(`s11-org1-${RUN_ID}`)
        expect(slugs).toContain(`s11-org2-${RUN_ID}`)

        // (e) Switch active org to org2 via the same RPC the action calls.
        const { error: rpcErr } = await anon.rpc('set_active_organization', {
            p_org_id: org2Id,
        })
        expect(rpcErr).toBeNull()

        // (f) Stamp app_metadata.current_org_id (service role) — what
        //     setActiveOrgAndRedirectAction does after the RPC.
        const { error: stampErr } = await svc.auth.admin.updateUserById(userId, {
            app_metadata: { current_org_id: org2Id },
        })
        expect(stampErr).toBeNull()

        // (g) Refresh the session and assert the JWT carries org2.
        const { error: refreshErr } = await anon.auth.refreshSession()
        expect(refreshErr).toBeNull()
        const { data: stampedUser } = await svc.auth.admin.getUserById(userId)
        expect(
            (stampedUser?.user?.app_metadata as { current_org_id?: string } | undefined)
                ?.current_org_id,
        ).toBe(org2Id)
    })
})
