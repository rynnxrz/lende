'use server'

import { createClient } from '@/lib/supabase/server'
import { track } from '@/lib/analytics/track'

export type SeedSampleResult =
    | { ok: true; itemsInserted: number; categoriesInserted: number; collectionsInserted: number }
    | { ok: false; error: string }

/**
 * BRIEF-48 step 4 — copy IVYJSTUDIO catalog as sample data into the caller's
 * current org. Wraps the `seed_org_from_template(uuid)` RPC defined in
 * migration 00061. Caller must be admin/owner of the target org (RPC enforces).
 */
export async function seedSampleAction(targetOrgId: string): Promise<SeedSampleResult> {
    if (!targetOrgId) {
        return { ok: false, error: 'Missing target org id.' }
    }

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return { ok: false, error: 'Not authenticated.' }
    }

    const { data, error } = await supabase
        .rpc('seed_org_from_template', { p_target_org_id: targetOrgId })
        .single<{
            items_inserted: number
            categories_inserted: number
            collections_inserted: number
        }>()

    if (error) {
        return { ok: false, error: error.message }
    }

    track('first_reservation_created', {
        kind: 'sample_data_seeded',
        org_id: targetOrgId,
        items_inserted: data?.items_inserted ?? 0,
    })

    return {
        ok: true,
        itemsInserted: data?.items_inserted ?? 0,
        categoriesInserted: data?.categories_inserted ?? 0,
        collectionsInserted: data?.collections_inserted ?? 0,
    }
}
