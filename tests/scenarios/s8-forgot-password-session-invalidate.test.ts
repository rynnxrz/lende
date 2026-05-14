import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-59 S8 — forgot-password flow invalidates every existing session.
 *
 * The reset action calls `auth.admin.signOut(userId, 'global')` after
 * `updateUser({ password })`. This test validates that:
 *   1. Pre-reset session A can call getUser() successfully.
 *   2. After updateUser({password}) + signOut(userId, 'global'), the
 *      access token from session A is no longer accepted (getUser()
 *      returns no user / 401-equivalent error).
 *   3. The new password works for sign-in.
 *
 * Note: We don't exercise the email leg of the flow (the actual
 * `resetPasswordForEmail` call hitting Supabase SMTP). That requires
 * an inbucket / Resend round-trip and is covered by the Mac-terminal
 * "本地真测 1" portion of the BRIEF-59 DoD. This test pins the
 * critical post-reset invariant: old sessions stop working.
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
const oldPassword = 'brief-59-s8-old-12345'
const newPassword = 'brief-59-s8-new-67890'

const createdUserIds: string[] = []

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

async function cleanup() {
    const svc = service()
    for (const uid of createdUserIds) {
        try {
            await svc.auth.admin.deleteUser(uid)
        } catch {}
    }
}

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-59 s8 — forgot-password invalidates existing sessions', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('admin.signOut(global) invalidates session A; new password signs in cleanly', async () => {
        const svc = service()
        const email = `s8-${RUN_ID}@example.com`

        // 0. Pre-create user
        const { data: c, error: cErr } = await svc.auth.admin.createUser({
            email,
            password: oldPassword,
            email_confirm: true,
        })
        expect(cErr).toBeNull()
        const userId = c.user!.id
        createdUserIds.push(userId)

        // 1. Session A: sign in with the old password, capture the
        //    access token; verify it's currently good.
        const sessionA = anonClient()
        const { data: signInA, error: signInAErr } = await sessionA.auth.signInWithPassword({
            email,
            password: oldPassword,
        })
        expect(signInAErr).toBeNull()
        const tokenA = signInA.session?.access_token
        expect(tokenA).toBeTruthy()

        // Sanity: session A can read its own user via the access token.
        const probeA = createSupabaseClient(SUPABASE_URL, ANON_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
            global: { headers: { Authorization: `Bearer ${tokenA}` } },
        })
        const { data: meBefore } = await probeA.auth.getUser()
        expect(meBefore.user?.id).toBe(userId)

        // 2. Mirror the reset action: updateUser → signOut(global).
        //    We use the service role to call admin.signOut so the test
        //    doesn't need to thread a real /reset-password page.
        await svc.auth.admin.updateUserById(userId, { password: newPassword })
        await svc.auth.admin.signOut(userId, 'global')

        // 3. Session A's access token is now stale. Verify probeA
        //    can't fetch the user any more (Supabase returns null user
        //    + AuthApiError on the JWT).
        const probeAfter = createSupabaseClient(SUPABASE_URL, ANON_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
            global: { headers: { Authorization: `Bearer ${tokenA}` } },
        })
        const { data: meAfter, error: meAfterErr } = await probeAfter.auth.getUser()
        // Either the call errors, or the user comes back null. Both
        // are treated as "session A is dead" by middleware.
        const sessionDead = !!meAfterErr || meAfter.user === null
        expect(sessionDead).toBe(true)

        // 4. Old password no longer works.
        const sessionRetry = anonClient()
        const { error: oldErr } = await sessionRetry.auth.signInWithPassword({
            email,
            password: oldPassword,
        })
        expect(oldErr).not.toBeNull()

        // 5. New password works cleanly.
        const sessionB = anonClient()
        const { data: signInB, error: signInBErr } = await sessionB.auth.signInWithPassword({
            email,
            password: newPassword,
        })
        expect(signInBErr).toBeNull()
        expect(signInB.session?.access_token).toBeTruthy()
    })
})
