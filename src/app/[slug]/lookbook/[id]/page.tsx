import { notFound } from 'next/navigation'

import { createServiceClient } from '@/lib/supabase/server'

import { LookbookViewer } from './LookbookViewer'

type RouteParams = { slug: string; id: string }

const SIGNED_URL_TTL_SECONDS = 60 * 60

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<RouteParams> }) {
    const { id } = await params
    return { title: `${id} · Lookbook` }
}

export default async function LookbookPage({
    params,
}: {
    params: Promise<RouteParams>
}) {
    const { slug: orgSlug, id: lookbookSlug } = await params
    const sb = createServiceClient()

    const { data: org } = await sb
        .from('organizations')
        .select('id, name')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) notFound()

    const { data: lookbook } = await sb
        .from('pdf_lookbooks')
        .select('id, title, pdf_url, page_count, published, editor_status')
        .eq('organization_id', org.id)
        .ilike('slug', lookbookSlug)
        .eq('published', true)
        .eq('editor_status', 'published')
        .maybeSingle()
    if (!lookbook) notFound()

    type ItemFields = {
        id: string
        sku: string | null
        name: string | null
        rental_price: number | string | null
        replacement_cost: number | string | null
        images: string[] | null
        description: string | null
        category: string | null
        material: string | null
        color: string | null
        weight: string | null
        specs: Record<string, unknown> | null
    }
    type LookbookItemRow = {
        id: string
        page_number: number
        bbox_x: string | number | null
        bbox_y: string | number | null
        bbox_w: string | number | null
        bbox_h: string | number | null
        match_status: string
        inventory_item_id: string | null
        items: ItemFields | ItemFields[] | null
    }
    const { data: itemsRaw } = await sb
        .from('pdf_lookbook_items')
        .select(
            'id, page_number, bbox_x, bbox_y, bbox_w, bbox_h, match_status, ' +
                'inventory_item_id, items:inventory_item_id(id, sku, name, rental_price, replacement_cost, images, description, category, material, color, weight, specs)',
        )
        .eq('lookbook_id', lookbook.id)
        .not('bbox_x', 'is', null)
        .in('match_status', ['auto_matched', 'confirmed'])
        .order('page_number', { ascending: true })
    const items = (itemsRaw ?? []) as unknown as LookbookItemRow[]

    let pdfSignedUrl: string | null = null
    if (lookbook.pdf_url) {
        const { data: signed } = await sb.storage
            .from('lookbooks')
            .createSignedUrl(lookbook.pdf_url, SIGNED_URL_TTL_SECONDS)
        pdfSignedUrl = signed?.signedUrl ?? null
    }

    if (!pdfSignedUrl) notFound()

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <LookbookViewer
                orgName={org.name}
                organizationId={org.id}
                lookbookId={lookbook.id}
                lookbookTitle={lookbook.title}
                pageCount={lookbook.page_count ?? 0}
                pdfSignedUrl={pdfSignedUrl}
                items={items.map(row => ({
                    id: row.id,
                    page_number: row.page_number,
                    bbox_x: Number(row.bbox_x ?? 0),
                    bbox_y: Number(row.bbox_y ?? 0),
                    bbox_w: Number(row.bbox_w ?? 0),
                    bbox_h: Number(row.bbox_h ?? 0),
                    inventory_item_id: row.inventory_item_id,
                    item: Array.isArray(row.items) ? row.items[0] ?? null : row.items ?? null,
                }))}
            />
        </div>
    )
}
