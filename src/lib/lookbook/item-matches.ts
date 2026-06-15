import { createServiceClient } from '@/lib/supabase/server'

export type LookbookMatchStatus = 'needs_review' | 'auto_matched' | 'confirmed' | 'rejected_no_match'
export type LookbookEditorStatus = 'draft' | 'reviewing' | 'published'

export type LookbookMatch = {
    matchId: string
    lookbookId: string
    lookbookSlug: string
    lookbookTitle: string
    lookbookEditorStatus: LookbookEditorStatus
    lookbookPublished: boolean
    page: number
    bbox: { x: number; y: number; w: number; h: number } | null
    status: LookbookMatchStatus
    confidence: number | null
    visualDescription: string | null
    visibleText: string | null
    pageImageUrl: string | null
}

const PAGE_IMAGE_TTL_SECONDS = 60 * 60
const BUCKET = 'lookbooks'

type Row = {
    id: string
    lookbook_id: string
    page_number: number
    bbox_x: number | string | null
    bbox_y: number | string | null
    bbox_w: number | string | null
    bbox_h: number | string | null
    match_status: LookbookMatchStatus
    match_confidence: number | string | null
    session_visual_description: string | null
    session_visible_text: string | null
    inventory_item_id: string | null
    pdf_lookbooks: {
        id: string
        slug: string
        title: string
        editor_status: LookbookEditorStatus
        published: boolean
        organization_id: string
        created_at: string
    } | null
}

function pageImagePath(lookbookId: string, page: number): string {
    return `lookbook-pages/${lookbookId}/p-${String(page).padStart(3, '0')}.jpg`
}

function toNumber(v: number | string | null): number | null {
    if (v === null || v === undefined) return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
}

export async function getLookbookMatchesForItems(
    orgId: string,
    itemIds: string[]
): Promise<Map<string, LookbookMatch[]>> {
    const out = new Map<string, LookbookMatch[]>()
    if (!orgId || itemIds.length === 0) return out

    const sb = createServiceClient()

    const { data, error } = await sb
        .from('pdf_lookbook_items')
        .select(
            'id, lookbook_id, page_number, bbox_x, bbox_y, bbox_w, bbox_h, match_status, match_confidence, ' +
                'session_visual_description, session_visible_text, inventory_item_id, ' +
                'pdf_lookbooks:lookbook_id(id, slug, title, editor_status, published, organization_id, created_at)'
        )
        .in('inventory_item_id', itemIds)
        .in('match_status', ['auto_matched', 'confirmed'])

    if (error || !data) return out

    const rows = (data as unknown as Row[]).filter(r => r.pdf_lookbooks?.organization_id === orgId)

    // Collect unique page image paths to batch-sign
    const uniqueImagePaths = new Set<string>()
    for (const r of rows) {
        if (!r.pdf_lookbooks) continue
        if (r.bbox_x === null) continue
        uniqueImagePaths.add(pageImagePath(r.lookbook_id, r.page_number))
    }

    const pathToUrl = new Map<string, string>()
    if (uniqueImagePaths.size > 0) {
        const { data: signed } = await sb.storage
            .from(BUCKET)
            .createSignedUrls(Array.from(uniqueImagePaths), PAGE_IMAGE_TTL_SECONDS)
        for (const item of signed ?? []) {
            if (item.path && item.signedUrl) pathToUrl.set(item.path, item.signedUrl)
        }
    }

    for (const r of rows) {
        if (!r.inventory_item_id || !r.pdf_lookbooks) continue

        const bx = toNumber(r.bbox_x)
        const by = toNumber(r.bbox_y)
        const bw = toNumber(r.bbox_w)
        const bh = toNumber(r.bbox_h)
        const bbox = bx !== null && by !== null && bw !== null && bh !== null
            ? { x: bx, y: by, w: bw, h: bh }
            : null

        const path = pageImagePath(r.lookbook_id, r.page_number)

        const match: LookbookMatch = {
            matchId: r.id,
            lookbookId: r.pdf_lookbooks.id,
            lookbookSlug: r.pdf_lookbooks.slug,
            lookbookTitle: r.pdf_lookbooks.title,
            lookbookEditorStatus: r.pdf_lookbooks.editor_status,
            lookbookPublished: r.pdf_lookbooks.published,
            page: r.page_number,
            bbox,
            status: r.match_status,
            confidence: toNumber(r.match_confidence),
            visualDescription: r.session_visual_description,
            visibleText: r.session_visible_text,
            pageImageUrl: bbox ? pathToUrl.get(path) ?? null : null,
        }

        const existing = out.get(r.inventory_item_id)
        if (existing) existing.push(match)
        else out.set(r.inventory_item_id, [match])
    }

    // Sort each item's matches: confirmed first, then newest lookbook first
    const rankStatus = (s: LookbookMatchStatus) => (s === 'confirmed' ? 0 : 1)
    const lookbookCreatedAt = new Map<string, string>()
    for (const r of rows) {
        if (r.pdf_lookbooks) lookbookCreatedAt.set(r.pdf_lookbooks.id, r.pdf_lookbooks.created_at)
    }
    for (const matches of out.values()) {
        matches.sort((a, b) => {
            const rs = rankStatus(a.status) - rankStatus(b.status)
            if (rs !== 0) return rs
            const ad = lookbookCreatedAt.get(a.lookbookId) ?? ''
            const bd = lookbookCreatedAt.get(b.lookbookId) ?? ''
            return bd.localeCompare(ad)
        })
    }

    return out
}

export async function getLookbookMatchCountsForItems(
    orgId: string,
    itemIds: string[]
): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!orgId || itemIds.length === 0) return out

    const sb = createServiceClient()
    const { data, error } = await sb
        .from('pdf_lookbook_items')
        .select(
            'inventory_item_id, pdf_lookbooks:lookbook_id(organization_id)'
        )
        .in('inventory_item_id', itemIds)
        .in('match_status', ['auto_matched', 'confirmed'])
        .not('bbox_x', 'is', null)

    if (error || !data) return out

    for (const row of data as unknown as Array<{
        inventory_item_id: string | null
        pdf_lookbooks: { organization_id: string } | null
    }>) {
        if (!row.inventory_item_id || row.pdf_lookbooks?.organization_id !== orgId) continue
        out.set(row.inventory_item_id, (out.get(row.inventory_item_id) ?? 0) + 1)
    }

    return out
}
