import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-61 S14 — deactivate_org RPC preserves data.
 *
 * Validates migration 00066 deactivate_org(p_org_id, p_reason):
 *   1. Create active org with N items + M reservations.
 *   2. Call deactivate_org(org_id, "inactive 60 days") via service-role.
 *   3. Assert organizations.subscription_status == 'cancelled'.
 *   4. Assert items / reservations rows preserved (not deleted).
 *   5. Assert org_admin_events row with action='deactivate_org' +
 *      payload.reason matches.
 *   6. Empty / too-short reason raises.
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

const createdOrgIds: string[] = []
const createdItemIds: string[] = []
const createdReservationIds: string[] = []
const createdUserIds: string[] = []

function service(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

async function createOrg(slug: string, name: string): Promise<string> {
    const svc = service()
    const { data, error } = await svc
        .from('organizations')
        .insert({
            slug,
            name,
            plan: 'starter',
            subscription_status: 'active',
            subscription_id: `s14-test-${RUN_ID}`,
        })
        .select('id')
        .single()
    if (error || !data) throw new Error(`createOrg failed: ${error?.message}`)
    createdOrgIds.push(data.id)
    return data.id
}

async function cleanup() {
    const svc = service()
    if (createdReservationIds.length) {
        await svc.from('reservations').delete().in('id', createdReservationIds)
    }
    if (createdItemIds.length) {
        await svc.from('items').delete().in('id', createdItemIds)
    }
    if (createdOrgIds.length) {
        await svc.from('org_admin_events').delete().in('organization_id', createdOrgIds)
        await svc.from('organizations').delete().in('id', createdOrgIds)
    }
    for (const uid of createdUserIds) {
        try {
            await svc.auth.admin.deleteUser(uid)
        } catch {}
    }
}

async function createUser(email: string): Promise<string> {
    const svc = service()
    const { data, error } = await svc.auth.admin.createUser({
        email,
        password: 'brief-61-s14-12345',
        email_confirm: true,
    })
    if (error || !data?.user) throw new Error(`createUser failed: ${error?.message}`)
    createdUserIds.push(data.user.id)
    return data.user.id
}

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-61 s14 — deactivate_org RPC', () => {
    test.skip(!!skipReason, skipReason)
    test.afterAll(async () => {
        await cleanup()
    })

    test('deactivate_org sets cancelled, preserves rows, audits', async () => {
        const svc = service()
        const orgId = await createOrg(`s14-${RUN_ID}`, `S14 ${RUN_ID}`)
        const customerId = await createUser(`s14-${RUN_ID}@example.com`)

        for (let i = 0; i < 5; i++) {
            const { data, error } = await svc
                .from('items')
                .insert({
                    sku: `s14-${RUN_ID}-${i}`,
                    name: `S14 item ${i}`,
                    organization_id: orgId,
                    rental_price: 120 + i,
                    replacement_cost: 800 + i,
                })
                .select('id')
                .single()
            if (error || !data) throw new Error(`item insert failed: ${error?.message}`)
            createdItemIds.push(data.id)
        }
        const firstItemId = createdItemIds[0]
        if (!firstItemId) throw new Error('missing first item')
        for (let i = 0; i < 2; i++) {
            const start = new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000)
            const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
            const { data, error } = await svc
                .from('reservations')
                .insert({
                    organization_id: orgId,
                    item_id: firstItemId,
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

        const reason = 'inactive 60 days'
        const { error } = await svc.rpc('deactivate_org', {
            p_org_id: orgId,
            p_reason: reason,
        })
        expect(error).toBeNull()

        const { data: orgRow } = await svc
            .from('organizations')
            .select('subscription_status')
            .eq('id', orgId)
            .single()
        expect(orgRow?.subscription_status).toBe('cancelled')

        const { count: itemsCount } = await svc
            .from('items')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
        expect(itemsCount).toBe(5)

        const { count: reservationsCount } = await svc
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
        expect(reservationsCount).toBe(2)

        const { data: events } = await svc
            .from('org_admin_events')
            .select('action, payload')
            .eq('organization_id', orgId)
            .eq('action', 'deactivate_org')
        expect(events?.length).toBe(1)
        const payload = events![0].payload as { reason?: string }
        expect(payload.reason).toBe(reason)
    })

    test('deactivate_org rejects empty reason', async () => {
        const svc = service()
        const orgId = await createOrg(`s14-empty-${RUN_ID}`, `S14 empty ${RUN_ID}`)
        const { error } = await svc.rpc('deactivate_org', {
            p_org_id: orgId,
            p_reason: '',
        })
        expect(error).not.toBeNull()
    })

    test('deactivate_org rejects reason < 3 chars', async () => {
        const svc = service()
        const orgId = await createOrg(`s14-short-${RUN_ID}`, `S14 short ${RUN_ID}`)
        const { error } = await svc.rpc('deactivate_org', {
            p_org_id: orgId,
            p_reason: 'no',
        })
        expect(error).not.toBeNull()
    })
})
