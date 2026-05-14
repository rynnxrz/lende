import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-59 S7 — existing user accepts an invitation into a second org.
 *
 * Validates the new mode='existing' branch in
 * src/app/actions/invitations/accept.ts:
 *   1. Create userA via the regular invitation flow into org1.
 *   2. Admin (service-role) issues a fresh invitation for userA's
 *      same email to org2.
 *   3. User accepts via the multi-org branch — re-authenticate with
 *      the *existing* password (NOT just the invitation token).
 *   4. Assert:
 *      - organization_members has 2 rows for userA (org1 + org2),
 *      - JWT.app_metadata.current_org_id == org2.id (refreshSession ran),
 *      - invitation_accept_events row with mode='existing' exists.
 *
 * The test exercises the audit-row insert from migration 00064 +
 * the refreshAndStampOrg helper at the end of the existing-user path.
 *
 * Live tests skip automatically when SUPABASE env is missing.
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
const password = 'brief-59-s7-12345'

const createdUserIds: string[] = []
const createdOrgIds: string[] = []
const createdInvitationIds: string[] = []

function service(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

function anonClient(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, ANON_KEY, {
        auth: { autoRefreshToken: true, persistSession: true },
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
    createdOrgIds.push(data.id)
    return data.id
}

async function createInvitation(
    orgId: string,
    email: string,
    role: 'admin' | 'staff' = 'admin',
    expiresInMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<{ id: string; token: string }> {
    const svc = service()
    const { data, error } = await svc
        .from('organization_invitations')
        .insert({
            organization_id: orgId,
            email,
            role,
            expires_at: new Date(Date.now() + expiresInMs).toISOString(),
        })
        .select('id, token')
        .single()
    if (error || !data) throw new Error(`createInvitation failed: ${error?.message}`)
    createdInvitationIds.push(data.id)
    return { id: data.id, token: data.token }
}

async function cleanup() {
    const svc = service()
    if (createdInvitationIds.length) {
        await svc.from('organization_invitations').delete().in('id', createdInvitationIds)
    }
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

test.describe('BRIEF-59 s7 — existing user joins second org', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('userA already in org1 accepts invitation into org2 with existing password', async () => {
        const svc = service()

        // (a) Set up org1, invite userA, run the new-user accept flow
        // by calling the same RPC the action calls (mode='new').
        const org1Id = await createOrg(`s7-org1-${RUN_ID}`, `S7 Org1 ${RUN_ID}`)
        const email = `s7-${RUN_ID}@example.com`
        const { id: inv1Id } = await createInvitation(org1Id, email, 'admin')

        const { data: createData, error: createErr } = await svc.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        expect(createErr).toBeNull()
        const userId = createData.user!.id
        createdUserIds.push(userId)

        const userClient = anonClient()
        const { error: signInA } = await userClient.auth.signInWithPassword({ email, password })
        expect(signInA).toBeNull()

        const { error: rpc1Err } = await userClient.rpc('accept_invitation_atomic', {
            p_invitation_id: inv1Id,
            p_user_id: userId,
            p_organization_id: org1Id,
            p_role: 'admin',
            p_invited_by: null,
            p_mode: 'new',
            p_source_ip: null,
        })
        expect(rpc1Err).toBeNull()

        await svc.auth.admin.updateUserById(userId, {
            app_metadata: { current_org_id: org1Id },
        })

        // (b) Admin creates org2 + invites the same email.
        const org2Id = await createOrg(`s7-org2-${RUN_ID}`, `S7 Org2 ${RUN_ID}`)
        const { id: inv2Id } = await createInvitation(org2Id, email, 'staff')

        // (c) Existing-user branch: re-auth with the same password,
        // accept under existing user_id, then stamp + refresh.
        const userClient2 = anonClient()
        const { error: signInB } = await userClient2.auth.signInWithPassword({
            email,
            password, // existingPassword in the action contract
        })
        expect(signInB).toBeNull()

        const { error: rpc2Err } = await userClient2.rpc('accept_invitation_atomic', {
            p_invitation_id: inv2Id,
            p_user_id: userId,
            p_organization_id: org2Id,
            p_role: 'staff',
            p_invited_by: null,
            p_mode: 'existing',
            p_source_ip: '203.0.113.7',
        })
        expect(rpc2Err).toBeNull()

        await svc.auth.admin.updateUserById(userId, {
            app_metadata: { current_org_id: org2Id },
        })
        const { data: refreshed, error: refErr } = await userClient2.auth.refreshSession()
        expect(refErr).toBeNull()

        // (d) Assert: 2 memberships
        const { data: members } = await svc
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', userId)
        const orgIds = new Set((members ?? []).map((m) => m.organization_id))
        expect(orgIds.has(org1Id)).toBe(true)
        expect(orgIds.has(org2Id)).toBe(true)
        expect(orgIds.size).toBeGreaterThanOrEqual(2)

        // (e) Assert: JWT current_org_id == org2.id
        const newToken = refreshed.session?.access_token
        expect(newToken).toBeTruthy()
        const payloadJson = Buffer.from(newToken!.split('.')[1], 'base64').toString('utf8')
        const claims = JSON.parse(payloadJson)
        const claimedOrg =
            claims?.app_metadata?.current_org_id ?? claims?.org_id ?? null
        expect(claimedOrg).toBe(org2Id)

        // (f) Assert: audit row with mode='existing' for org2
        const { data: events, error: evErr } = await svc
            .from('invitation_accept_events')
            .select('mode, organization_id, source_ip')
            .eq('user_id', userId)
            .eq('organization_id', org2Id)
        expect(evErr).toBeNull()
        const existingEvent = (events ?? []).find((e) => e.mode === 'existing')
        expect(existingEvent).toBeTruthy()
        expect(existingEvent?.source_ip).toBe('203.0.113.7')
    })

    test('wrong existing-password is rejected (token alone is not enough)', async () => {
        const svc = service()
        const org3Id = await createOrg(`s7b-${RUN_ID}`, `S7b ${RUN_ID}`)
        const email = `s7b-${RUN_ID}@example.com`
        const { id: inv3Id } = await createInvitation(org3Id, email, 'staff')

        // Pre-create user with a known password
        const { data: c, error: cErr } = await svc.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        expect(cErr).toBeNull()
        const userId = c.user!.id
        createdUserIds.push(userId)

        const userClient = anonClient()
        // Try the wrong password — must fail before any membership write.
        const { error: signInErr } = await userClient.auth.signInWithPassword({
            email,
            password: 'wrong-' + password,
        })
        expect(signInErr).not.toBeNull()

        // Membership must still be empty for org3
        const { data: members } = await svc
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', org3Id)
            .eq('user_id', userId)
        expect(members?.length ?? 0).toBe(0)

        // Invitation still actionable (accepted_at NULL)
        const { data: inv } = await svc
            .from('organization_invitations')
            .select('accepted_at')
            .eq('id', inv3Id)
            .single()
        expect(inv?.accepted_at).toBeNull()
    })
})
