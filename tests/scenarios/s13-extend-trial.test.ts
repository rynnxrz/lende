import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-61 S13 — extend_trial RPC.
 *
 * Validates migration 00066 extend_trial(p_org_id, p_days):
 *   1. Create org with trial_ends_at = NOW + 3d.
 *   2. Call extend_trial(org_id, 7) via service-role.
 *   3. Assert organizations.trial_ends_at is now NOW + 10d (± 1 minute).
 *   4. Assert org_admin_events row inserted with action='extend_trial'
 *      and payload.days == 7.
 *   5. Out-of-range argument (-1, 91) raises.
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

async function createOrg(slug: string, name: string, trialEndsAt: Date): Promise<string> {
    const svc = service()
    const { data, error } = await svc
        .from('organizations')
        .insert({
            slug,
            name,
            plan: 'trial',
            trial_ends_at: trialEndsAt.toISOString(),
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`createOrg failed: ${error?.message}`)
    createdOrgIds.push(data.id)
    return data.id
}

async function cleanup() {
    const svc = service()
    if (createdOrgIds.length) {
        await svc.from('org_admin_events').delete().in('organization_id', createdOrgIds)
        await svc.from('organizations').delete().in('id', createdOrgIds)
    }
}

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-61 s13 — extend_trial RPC', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('extend_trial(org, 7) shifts trial_ends_at + audits', async () => {
        const svc = service()
        const initial = new Date(Date.now() + 3 * 86_400_000)
        const orgId = await createOrg(
            `s13-${RUN_ID}`,
            `S13 ${RUN_ID}`,
            initial,
        )

        const { data: newEnds, error } = await svc.rpc('extend_trial', {
            p_org_id: orgId,
            p_days: 7,
        })
        expect(error).toBeNull()
        expect(newEnds).toBeTruthy()

        const expected = new Date(initial.getTime() + 7 * 86_400_000)
        const actual = new Date(String(newEnds))
        expect(Math.abs(actual.getTime() - expected.getTime())).toBeLessThan(60_000)

        const { data: row, error: fetchErr } = await svc
            .from('organizations')
            .select('trial_ends_at')
            .eq('id', orgId)
            .single()
        expect(fetchErr).toBeNull()
        const dbTime = new Date(row!.trial_ends_at as string).getTime()
        expect(Math.abs(dbTime - expected.getTime())).toBeLessThan(60_000)

        const { data: events, error: eventsErr } = await svc
            .from('org_admin_events')
            .select('action, payload')
            .eq('organization_id', orgId)
            .eq('action', 'extend_trial')
        expect(eventsErr).toBeNull()
        expect(events?.length).toBe(1)
        const payload = events![0].payload as { days?: number }
        expect(payload.days).toBe(7)
    })

    test('extend_trial rejects p_days <= 0', async () => {
        const svc = service()
        const orgId = await createOrg(
            `s13-zero-${RUN_ID}`,
            `S13 zero ${RUN_ID}`,
            new Date(Date.now() + 86_400_000),
        )
        const { error } = await svc.rpc('extend_trial', { p_org_id: orgId, p_days: 0 })
        expect(error).not.toBeNull()
    })

    test('extend_trial rejects p_days > 90', async () => {
        const svc = service()
        const orgId = await createOrg(
            `s13-big-${RUN_ID}`,
            `S13 big ${RUN_ID}`,
            new Date(Date.now() + 86_400_000),
        )
        const { error } = await svc.rpc('extend_trial', { p_org_id: orgId, p_days: 91 })
        expect(error).not.toBeNull()
    })
})
