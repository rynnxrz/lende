import { createServiceClient } from '@/lib/supabase/server'

import type { LookbookEditorStatus, LookbookMatchStatus } from './item-matches'

export type { LookbookEditorStatus, LookbookMatchStatus } from './item-matches'

/** A candidate row that still needs admin attention (no inventory match yet). */
export type LookbookUnresolvedItem = {
    id: string
    page: number
    status: LookbookMatchStatus
    visibleText: string | null
    visualDescription: string | null
}

/** Per-PDF match coverage against the current inventory database. */
export type LookbookCoverage = {
    id: string
    slug: string
    title: string
    pageCount: number
    published: boolean
    editorStatus: LookbookEditorStatus
    updatedAt: string
    /** Total candidate rows extracted from the PDF. */
    total: number
    confirmed: number
    autoMatched: number
    needsReview: number
    rejectedNoMatch: number
    /** confirmed + autoMatched — rows linked to a live inventory item. */
    matched: number
    /** Distinct inventory items this PDF resolves to. */
    matchedItems: number
    /** matched / total, or null when the PDF has no candidates yet. */
    coveragePct: number | null
    /** needs_review + rejected_no_match rows, for the drill-down. */
    unresolved: LookbookUnresolvedItem[]
}

type LookbookRow = {
    id: string
    slug: string
    title: string
    page_count: number | null
    published: boolean
    editor_status: LookbookEditorStatus
    updated_at: string
}

type ItemRow = {
    id: string
    lookbook_id: string
    page_number: number
    match_status: LookbookMatchStatus
    inventory_item_id: string | null
    session_visible_text: string | null
    session_visual_description: string | null
}

/**
 * Build per-PDF match coverage for an org so admins can see, at a glance,
 * whether each uploaded lookbook actually lines up with the current
 * inventory database. No schema change — everything is derived from
 * `pdf_lookbook_items.match_status` / `inventory_item_id`.
 */
export async function getLookbookCoverage(orgId: string): Promise<LookbookCoverage[]> {
    if (!orgId) return []

    const sb = createServiceClient()

    const { data: lookbooksRaw } = await sb
        .from('pdf_lookbooks')
        .select('id, slug, title, page_count, published, editor_status, updated_at')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false })

    const lookbooks = (lookbooksRaw ?? []) as unknown as LookbookRow[]
    if (lookbooks.length === 0) return []

    const lookbookIds = lookbooks.map(l => l.id)

    const { data: itemsRaw } = await sb
        .from('pdf_lookbook_items')
        .select(
            'id, lookbook_id, page_number, match_status, inventory_item_id, ' +
                'session_visible_text, session_visual_description',
        )
        .in('lookbook_id', lookbookIds)
        .order('page_number', { ascending: true })

    const items = (itemsRaw ?? []) as unknown as ItemRow[]

    // Group candidate rows by lookbook.
    const byLookbook = new Map<string, ItemRow[]>()
    for (const row of items) {
        const list = byLookbook.get(row.lookbook_id)
        if (list) list.push(row)
        else byLookbook.set(row.lookbook_id, [row])
    }

    return lookbooks.map(lb => {
        const rows = byLookbook.get(lb.id) ?? []

        let confirmed = 0
        let autoMatched = 0
        let needsReview = 0
        let rejectedNoMatch = 0
        const matchedItemIds = new Set<string>()
        const unresolved: LookbookUnresolvedItem[] = []

        for (const row of rows) {
            switch (row.match_status) {
                case 'confirmed':
                    confirmed++
                    if (row.inventory_item_id) matchedItemIds.add(row.inventory_item_id)
                    break
                case 'auto_matched':
                    autoMatched++
                    if (row.inventory_item_id) matchedItemIds.add(row.inventory_item_id)
                    break
                case 'needs_review':
                    needsReview++
                    unresolved.push({
                        id: row.id,
                        page: row.page_number,
                        status: row.match_status,
                        visibleText: row.session_visible_text,
                        visualDescription: row.session_visual_description,
                    })
                    break
                case 'rejected_no_match':
                    rejectedNoMatch++
                    unresolved.push({
                        id: row.id,
                        page: row.page_number,
                        status: row.match_status,
                        visibleText: row.session_visible_text,
                        visualDescription: row.session_visual_description,
                    })
                    break
            }
        }

        const total = rows.length
        const matched = confirmed + autoMatched

        return {
            id: lb.id,
            slug: lb.slug,
            title: lb.title,
            pageCount: lb.page_count ?? 0,
            published: lb.published,
            editorStatus: lb.editor_status,
            updatedAt: lb.updated_at,
            total,
            confirmed,
            autoMatched,
            needsReview,
            rejectedNoMatch,
            matched,
            matchedItems: matchedItemIds.size,
            coveragePct: total > 0 ? matched / total : null,
            unresolved,
        }
    })
}
