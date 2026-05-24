import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { RESERVATION_STATUSES } from '@/lib/constants/reservation-status'
import {
    buildReservationGroupKey,
    ensureReservationGroupAssessment,
    type ReservationAssessmentRow,
} from '@/lib/reservations/assessment'
import {
    assertGroundingProviderAvailable,
    assessPrestige,
} from '@/lib/reservations/prestige-agent'
import {
    buildPrestigeAgentInput,
    setPrestigeAssessment,
    type AssessmentRowForPrestige,
} from '@/lib/reservations/prestige-store'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_GROUPS_PER_RUN = 25
const CHUNK_SIZE = 3
const HARD_STOP_MS = 270_000
const DAILY_BUDGET = 200
const RERANK_INTERVAL_DAYS = 14

type CronOutcome =
    | { groupKey: string; status: 'ranked'; tier: string; score: number; durationMs: number }
    | { groupKey: string; status: 'skipped'; reason: string }
    | { groupKey: string; status: 'failed'; error: string; durationMs: number }

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (process.env.PRESTIGE_RANKING_ENABLED !== 'true') {
        return NextResponse.json({ skipped: true, reason: 'PRESTIGE_RANKING_ENABLED is not true' })
    }

    try {
        await assertGroundingProviderAvailable()
    } catch (err) {
        const message = err instanceof Error ? err.message : 'grounding-provider check failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }

    const startedAt = Date.now()
    const supabase = createServiceClient()

    // Budget guard: bail early if we've already burned the daily cap.
    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: usedToday } = await supabase
        .from('ai_decisions')
        .select('id', { count: 'exact', head: true })
        .eq('feature', 'prestige_ranking')
        .gte('created_at', dayAgoIso)

    if (typeof usedToday === 'number' && usedToday >= DAILY_BUDGET) {
        return NextResponse.json({
            skipped: true,
            reason: `daily budget exceeded (${usedToday}/${DAILY_BUDGET})`,
        })
    }

    // Pull pending-request reservations created in the last 48h.
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: reservations, error: resErr } = await supabase
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
        .eq('status', RESERVATION_STATUSES.PENDING_REQUEST)
        .gte('created_at', fortyEightHoursAgo)
        .order('created_at', { ascending: false })

    if (resErr) {
        return NextResponse.json({ error: `query failed: ${resErr.message}` }, { status: 500 })
    }

    type ReservationRow = ReservationAssessmentRow & AssessmentRowForPrestige
    const rows = (reservations || []) as unknown as ReservationRow[]
    if (rows.length === 0) {
        return NextResponse.json({ processed: 0, skipped: 0, failed: 0, durationMs: Date.now() - startedAt })
    }

    // Group by reservation_group_key.
    const groupsByKey = new Map<string, ReservationRow[]>()
    for (const row of rows) {
        const key = buildReservationGroupKey({ id: row.id, group_id: row.group_id })
        const list = groupsByKey.get(key) || []
        list.push(row)
        groupsByKey.set(key, list)
    }

    // Skip groups that already have a recent prestige_generated_at.
    const reRankCutoff = new Date(Date.now() - RERANK_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const candidateKeys = Array.from(groupsByKey.keys())
    const { data: existing } = await supabase
        .from('reservation_group_assessments')
        .select('group_key, prestige_generated_at')
        .in('group_key', candidateKeys)

    const skipKeys = new Set(
        ((existing || []) as Array<{ group_key: string; prestige_generated_at: string | null }>)
            .filter(r => r.prestige_generated_at && r.prestige_generated_at > reRankCutoff)
            .map(r => r.group_key)
    )

    const workQueue: Array<{ key: string; group: ReservationRow[] }> = []
    for (const [key, group] of groupsByKey.entries()) {
        if (skipKeys.has(key)) continue
        workQueue.push({ key, group })
        if (workQueue.length >= MAX_GROUPS_PER_RUN) break
    }

    const outcomes: CronOutcome[] = []
    let cursor = 0

    while (cursor < workQueue.length) {
        if (Date.now() - startedAt > HARD_STOP_MS) {
            for (let i = cursor; i < workQueue.length; i++) {
                outcomes.push({ groupKey: workQueue[i].key, status: 'skipped', reason: 'time budget' })
            }
            break
        }

        const slice = workQueue.slice(cursor, cursor + CHUNK_SIZE)
        cursor += CHUNK_SIZE

        const settled = await Promise.allSettled(
            slice.map(async ({ key, group }): Promise<CronOutcome> => {
                const t0 = Date.now()
                try {
                    await ensureReservationGroupAssessment(group as ReservationAssessmentRow[])
                    const input = buildPrestigeAgentInput(key, group as AssessmentRowForPrestige[])
                    const prestige = await assessPrestige(input)
                    await setPrestigeAssessment(key, prestige)
                    return {
                        groupKey: key,
                        status: 'ranked',
                        tier: prestige.tier,
                        score: prestige.prestige_score,
                        durationMs: Date.now() - t0,
                    }
                } catch (err) {
                    return {
                        groupKey: key,
                        status: 'failed',
                        error: err instanceof Error ? err.message : 'unknown',
                        durationMs: Date.now() - t0,
                    }
                }
            })
        )

        for (const r of settled) {
            if (r.status === 'fulfilled') {
                outcomes.push(r.value)
            } else {
                outcomes.push({
                    groupKey: 'unknown',
                    status: 'failed',
                    error: String(r.reason),
                    durationMs: 0,
                })
            }
        }
    }

    const ranked = outcomes.filter(o => o.status === 'ranked').length
    const failed = outcomes.filter(o => o.status === 'failed').length
    const skipped = outcomes.filter(o => o.status === 'skipped').length

    return NextResponse.json({
        processed: ranked,
        failed,
        skipped,
        budgetUsed: typeof usedToday === 'number' ? usedToday : null,
        durationMs: Date.now() - startedAt,
        outcomes,
    })
}
