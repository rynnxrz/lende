import { createServiceClient } from '@/lib/supabase/server'
import type { PersistedPrestige, PrestigeAssessment } from '@/lib/reservations/prestige-agent'

export type PrestigeRecord = PersistedPrestige

/**
 * UPDATE-only writer for the prestige cols on reservation_group_assessments.
 * Caller MUST have already created the row via ensureReservationGroupAssessment
 * (the row has NOT NULL value-scoring cols which we don't manage here).
 * The four prestige cols are race-safe against the value-scoring upsert
 * because the two write disjoint column sets.
 */
export async function setPrestigeAssessment(
    groupKey: string,
    prestige: PersistedPrestige
): Promise<void> {
    const supabase = createServiceClient()
    const { error, count } = await supabase
        .from('reservation_group_assessments')
        .update(
            {
                prestige_score: prestige.prestige_score,
                prestige_tier: prestige.tier,
                prestige: prestige,
                prestige_generated_at: prestige.generated_at,
            },
            { count: 'exact' }
        )
        .eq('group_key', groupKey)

    if (error) {
        throw new Error(`setPrestigeAssessment failed for ${groupKey}: ${error.message}`)
    }
    if (count === 0) {
        throw new Error(
            `setPrestigeAssessment: no row found for group_key=${groupKey} — call ensureReservationGroupAssessment first`
        )
    }
}

export async function fetchPrestigeAssessments(
    groupKeys: string[]
): Promise<Map<string, PrestigeRecord | null>> {
    const map = new Map<string, PrestigeRecord | null>()
    if (groupKeys.length === 0) return map

    const supabase = createServiceClient()
    const { data, error } = await supabase
        .from('reservation_group_assessments')
        .select('group_key, prestige, prestige_score, prestige_tier, prestige_generated_at')
        .in('group_key', groupKeys)

    if (error) {
        throw new Error(`fetchPrestigeAssessments failed: ${error.message}`)
    }

    for (const row of (data || []) as Array<Record<string, unknown>>) {
        const groupKey = String(row.group_key)
        const prestigeJson = row.prestige as PrestigeRecord | null
        map.set(groupKey, prestigeJson || null)
    }

    return map
}

export async function fetchPrestigeGeneratedAt(groupKey: string): Promise<Date | null> {
    const supabase = createServiceClient()
    const { data } = await supabase
        .from('reservation_group_assessments')
        .select('prestige_generated_at')
        .eq('group_key', groupKey)
        .maybeSingle()

    const ts = data?.prestige_generated_at
    if (!ts) return null
    const d = new Date(ts as string)
    return isNaN(d.getTime()) ? null : d
}

export type AssessmentRowForPrestige = {
    id: string
    group_id: string | null
    renter_id: string | null
    item_id: string
    status: string | null
    start_date: string
    end_date: string
    created_at: string | null
    event_location: string | null
    dispatch_notes: string | null
    admin_notes: string | null
    items: {
        name: string | null
        sku: string | null
    } | null
    profiles: {
        full_name: string | null
        email: string | null
        company_name: string | null
    } | null
}

/**
 * Convenience builder: turns a group of joined reservation rows into the agent's input shape.
 * Single source of truth for both the cron and the server action.
 */
export function buildPrestigeAgentInput(
    groupKey: string,
    group: AssessmentRowForPrestige[]
): import('@/lib/reservations/prestige-agent').PrestigeAgentInput {
    const primary = group[0]
    return {
        groupKey,
        primaryReservationId: primary.id,
        eventLocation: primary.event_location,
        startDate: primary.start_date,
        endDate: primary.end_date,
        adminNotes: primary.admin_notes,
        dispatchNotes: primary.dispatch_notes,
        renter: {
            fullName: primary.profiles?.full_name || null,
            companyName: primary.profiles?.company_name || null,
            email: primary.profiles?.email || null,
        },
        items: group.map(r => ({
            name: r.items?.name || null,
            sku: r.items?.sku || null,
        })),
    }
}

export type { PrestigeAssessment }
