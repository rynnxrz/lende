import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-61 S12 — engagement_score formula correctness.
 *
 * Validates migration 00065's engagement_score(p_org_id) RPC against
 * D38 v0:
 *   1.0 × min(items, 50) / 50
 * + 1.5 × min(reservations, 20) / 20
 * + 1.0 × (1 if last_login_within_7d else 0)
 * + 0.5 × (1 if team_size >= 2 else 0)
 * + 1.0 × (1 if activation_within_1hr else 0)
 *   = 0..5 raw, normalized × 100/5 = 0..100
 *
 * Three orgs:
 *   A — high-engagement (12 items, 11 reservations, fresh login,
 *       2 team, activated <1h)
 *       expected: hot tier, score in [70, 100]
 *   B — empty (0 / 0 / no login / 1 team / not activated)
 *       expected: stale tier, score == 0
 *   C — middling (5 items, 0 reservations, fresh login, 1 team, activated <1h)
 *       expected: warm tier, score in [30, 60)
 *
 * Live tests skip automatically when SUPABASE env is missing.
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

const createdUserIds: string[] = []
const createdOrgIds: string[] = []
const createdItemIds: string[] = []
const createdReservationIds: string[] = []

function service(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
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

async function createUser(email: string): Promise<string> {
    const svc = service()
    const { data, error } = await svc.auth.admin.createUser({
        email,
        password: 'brief-61-s12-12345',
        email_confirm: true,
    })
    if (error || !data?.user) throw new Error(`createUser failed: ${error?.message}`)
    createdUserIds.push(data.user.id)
    return data.user.id
}

async function addMember(orgId: string, userId: string, role: 'owner' | 'admin' | 'staff'): Promise<void> {
    const svc = service()
    const { error } = await svc.from('organization_members').insert({
        organization_id: orgId,
        user_id: userId,
        role,
        accepted_at: new Date().toISOString(),
    })
    if (error) throw new Error(`addMember failed: ${error.message}`)
}

async function setLastActive(userId: string, when: Date): Promise<void> {
    const svc = service()
    const { error } = await svc
        .from('profiles')
        .update({ last_active_at: when.toISOString() })
        .eq('id', userId)
    if (error) throw new Error(`setLastActive failed: ${error.message}`)
}

async function createItems(orgId: string, count: number, withinLastHour: boolean): Promise<void> {
    const svc = service()
    const created = withinLastHour ? new Date() : new Date(Date.now() + 2 * 60 * 60 * 1000)
    for (let i = 0; i < count; i++) {
        const sku = `s12-${RUN_ID}-${orgId.slice(0, 8)}-${i}`
        const { data, error } = await svc
            .from('items')
            .insert({
                sku,
                name: `S12 item ${i}`,
                organization_id: orgId,
                rental_price: 100 + i,
                replacement_cost: 500 + i,
                created_at: created.toISOString(),
            })
            .select('id')
            .single()
        if (error || !data) throw new Error(`createItem failed: ${error?.message}`)
        createdItemIds.push(data.id)
    }
}

async function createReservation(orgId: string, itemId: string, customerId: string): Promise<void> {
    const svc = service()
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const { data, error } = await svc
        .from('reservations')
        .insert({
            organization_id: orgId,
            item_id: itemId,
            customer_id: customerId,
            start_date: start.toISOString().slice(0, 10),
            end_date: end.toISOString().slice(0, 10),
            status: 'Pending Request',
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`reservation insert failed: ${error?.message}`)
    createdReservationIds.push(data.id)
}

async function cleanup() {
    const svc = service()
    if (createdReservationIds.length) {
        await svc.from('reservations').delete().in('id', createdReservationIds)
    }
    if (createdItemIds.length) {
        await svc.from('items').delete().in('id', createdItemIds)
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

test.describe('BRIEF-61 s12 — engagement_score formula', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('Org A (perfect signals) → hot tier ≥ 70', async () => {
        const svc = service()
        const orgId = await createOrg(`s12-a-${RUN_ID}`, `S12 OrgA ${RUN_ID}`)
        const ownerId = await createUser(`s12-a-${RUN_ID}-owner@example.com`)
        const teamId = await createUser(`s12-a-${RUN_ID}-team@example.com`)
        await addMember(orgId, ownerId, 'owner')
        await addMember(orgId, teamId, 'staff')
        await setLastActive(ownerId, new Date())
        await setLastActive(teamId, new Date())
        await createItems(orgId, 12, true)

        const { data: seedItems, error: itemError } = await svc
            .from('items')
            .select('id')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: true })
            .limit(11)
        if (itemError || !seedItems || seedItems.length < 11) {
            throw new Error(`load seed items failed: ${itemError?.message}`)
        }

        for (const item of seedItems) {
            await createReservation(orgId, item.id, ownerId)
        }

        const { data: score, error } = await svc.rpc('engagement_score', { p_org_id: orgId })
        expect(error).toBeNull()
        expect(typeof Number(score)).toBe('number')
        expect(Number(score)).toBeGreaterThanOrEqual(70)
        expect(Number(score)).toBeLessThanOrEqual(100)
    })

    test('Org B (no signals) → stale tier == 0', async () => {
        const svc = service()
        const orgId = await createOrg(`s12-b-${RUN_ID}`, `S12 OrgB ${RUN_ID}`)
        const ownerId = await createUser(`s12-b-${RUN_ID}-owner@example.com`)
        await addMember(orgId, ownerId, 'owner')
        // no items, no reservations, no last_active_at, team=1, no activation

        const { data: score, error } = await svc.rpc('engagement_score', { p_org_id: orgId })
        expect(error).toBeNull()
        expect(Number(score)).toBe(0)
    })

    test('Org C (middling: items + recency + activation, no reservations / virality) → warm 30..60', async () => {
        const svc = service()
        const orgId = await createOrg(`s12-c-${RUN_ID}`, `S12 OrgC ${RUN_ID}`)
        const ownerId = await createUser(`s12-c-${RUN_ID}-owner@example.com`)
        await addMember(orgId, ownerId, 'owner')
        await setLastActive(ownerId, new Date())
        await createItems(orgId, 5, true)

        const { data: score, error } = await svc.rpc('engagement_score', { p_org_id: orgId })
        expect(error).toBeNull()
        // 1.0 × 5/50 = 0.1
        // + 0 reservations → 0
        // + 1.0 × 1 (recency) = 1.0
        // + 0.5 × 0 (team<2) = 0
        // + 1.0 × 1 (activation<1h) = 1.0
        // raw = 2.1, normalized = 2.1 * 100 / 5 = 42
        expect(Number(score)).toBeGreaterThanOrEqual(30)
        expect(Number(score)).toBeLessThan(60)
    })
})
