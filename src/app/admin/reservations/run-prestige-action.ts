'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidateAdminPath } from '@/lib/revalidate-admin'
import {
    assertGroundingProviderAvailable,
    assessPrestige,
    type PersistedPrestige,
} from '@/lib/reservations/prestige-agent'
import {
    buildPrestigeAgentInput,
    setPrestigeAssessment,
    fetchPrestigeAssessments,
    fetchPrestigeGeneratedAt,
    type AssessmentRowForPrestige,
} from '@/lib/reservations/prestige-store'
import {
    buildReservationGroupKey,
    ensureReservationGroupAssessment,
    type ReservationAssessmentRow,
} from '@/lib/reservations/assessment'

const COOLDOWN_MS = 5 * 60 * 1000

export type RunPrestigeResult =
    | { ok: true; prestige: PersistedPrestige; fromCache: boolean }
    | { ok: false; error: string }

export async function runPrestigeAnalysisAction(
    groupKey: string,
    primaryReservationId: string
): Promise<RunPrestigeResult> {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
        return { ok: false, error: 'unauthorized' }
    }
    const { data: profile } = await supabaseAuth
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
    if (profile?.role !== 'admin') {
        return { ok: false, error: 'forbidden' }
    }

    try {
        await assertGroundingProviderAvailable()
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'grounding provider unavailable',
        }
    }

    // Cooldown: if a row was generated less than 5 minutes ago, return the cached version.
    const lastGeneratedAt = await fetchPrestigeGeneratedAt(groupKey)
    if (lastGeneratedAt && Date.now() - lastGeneratedAt.getTime() < COOLDOWN_MS) {
        const cached = (await fetchPrestigeAssessments([groupKey])).get(groupKey)
        if (cached) {
            return { ok: true, prestige: cached, fromCache: true }
        }
    }

    const supabase = createServiceClient()
    const { data: groupRows, error: groupErr } = await supabase
        .from('reservations')
        .select(`
            id,
            group_id,
            renter_id,
            item_id,
            status,
            start_date,
            end_date,
            created_at,
            event_location,
            dispatch_notes,
            admin_notes,
            items (name, sku, rental_price, replacement_cost),
            profiles:renter_id (full_name, email, company_name)
        `)
        .or(`id.eq.${primaryReservationId},group_id.eq.${primaryReservationId}`)

    if (groupErr) {
        return { ok: false, error: `query failed: ${groupErr.message}` }
    }

    type Row = ReservationAssessmentRow & AssessmentRowForPrestige
    const rows = ((groupRows || []) as unknown as Row[]).filter(
        r => buildReservationGroupKey({ id: r.id, group_id: r.group_id }) === groupKey
    )

    if (rows.length === 0) {
        return { ok: false, error: `no rows found for groupKey=${groupKey}` }
    }

    try {
        await ensureReservationGroupAssessment(rows as ReservationAssessmentRow[])
        const input = buildPrestigeAgentInput(groupKey, rows as AssessmentRowForPrestige[])
        const prestige = await assessPrestige(input)
        await setPrestigeAssessment(groupKey, prestige)
        revalidateAdminPath('/reservations')
        return { ok: true, prestige, fromCache: false }
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'agent run failed',
        }
    }
}
