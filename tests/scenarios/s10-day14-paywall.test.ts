import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-60 S10 — day-14 paywall (D37 hard freeze).
 *
 * Targets the paywall branch added to src/lib/supabase/middleware.ts.
 * The middleware:
 *   - reads `organizations.{trial_ends_at, subscription_status}` for
 *     the slug in the URL,
 *   - on `trial_ends_at < NOW()` AND status IN (NULL, 'trialing'):
 *     302s POST/PATCH/PUT/DELETE to `/<slug>/billing/add-card`,
 *     stamps `X-Trial-Status: expired` on GET responses.
 *
 * This test exercises the *DB-side* invariants that the middleware
 * relies on, since the middleware runs inside Next's edge runtime and
 * is exercised separately by the Mac-terminal `npm run dev` + curl
 * smoke test (DoD §"本地真测 (b)").
 *
 * Specifically we assert:
 *   1. An org with `trial_ends_at = NOW - 1d` and
 *      `subscription_status IS NULL` is treated as expired.
 *   2. An org with `trial_ends_at = NOW + 7d` is treated as trialing.
 *   3. An org with `subscription_status = 'active'` is paid (paywall
 *      lifts even if `trial_ends_at` is in the past).
 *
 * The middleware's verdict logic is replicated here as a pure helper
 * so a regression in the SQL columns (e.g. someone removes
 * `subscription_status`) breaks this test.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const skipReason =
    !SUPABASE_URL || !SERVICE_ROLE
        ? 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set'
        : process.env.SUPABASE_URL_GUARDRAIL === 'production'
          ? 'Refusing to run scenarios against production database'
          : ''

const RUN_ID = Date.now().toString(36)

const createdOrgIds: string[] = []

function service(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

type Verdict = 'trialing' | 'expired' | 'paid' | 'unknown'

function classify(row: {
    trial_ends_at: string | null
    subscription_status: string | null
}): Verdict {
    const status = (row.subscription_status ?? '').toLowerCase()
    if (status && status !== 'trialing') return 'paid'
    if (!row.trial_ends_at) return 'unknown'
    const ends = Date.parse(row.trial_ends_at)
    if (Number.isNaN(ends)) return 'unknown'
    return ends < Date.now() ? 'expired' : 'trialing'
}

async function cleanup() {
    const svc = service()
    if (createdOrgIds.length) {
        await svc.from('organizations').delete().in('id', createdOrgIds)
    }
}

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-60 s10 — day-14 paywall verdict by trial_ends_at + subscription_status', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('expired trial with no subscription is classified as expired', async () => {
        const svc = service()
        const slug = `s10-exp-${RUN_ID}`
        const trialEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await svc
            .from('organizations')
            .insert({
                slug,
                name: `S10 Expired ${RUN_ID}`,
                plan: 'trial',
                trial_ends_at: trialEndsAt,
                subscription_status: null,
            })
            .select('id, trial_ends_at, subscription_status')
            .single()
        expect(error).toBeNull()
        expect(data).toBeTruthy()
        if (!data) return
        createdOrgIds.push(data.id as string)
        expect(classify(data)).toBe('expired')
    })

    test('active trial with no subscription is classified as trialing', async () => {
        const svc = service()
        const slug = `s10-trial-${RUN_ID}`
        const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await svc
            .from('organizations')
            .insert({
                slug,
                name: `S10 Trialing ${RUN_ID}`,
                plan: 'trial',
                trial_ends_at: trialEndsAt,
                subscription_status: 'trialing',
            })
            .select('id, trial_ends_at, subscription_status')
            .single()
        expect(error).toBeNull()
        if (!data) return
        createdOrgIds.push(data.id as string)
        expect(classify(data)).toBe('trialing')
    })

    test('paid org with active subscription bypasses paywall even if trial expired', async () => {
        const svc = service()
        const slug = `s10-paid-${RUN_ID}`
        const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await svc
            .from('organizations')
            .insert({
                slug,
                name: `S10 Paid ${RUN_ID}`,
                plan: 'pro',
                trial_ends_at: expiredAt,
                subscription_status: 'active',
            })
            .select('id, trial_ends_at, subscription_status')
            .single()
        expect(error).toBeNull()
        if (!data) return
        createdOrgIds.push(data.id as string)
        expect(classify(data)).toBe('paid')
    })
})
