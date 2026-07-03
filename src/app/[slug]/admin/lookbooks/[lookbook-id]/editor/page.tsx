import { notFound, redirect } from 'next/navigation'

import { createClient, createServiceClient } from '@/lib/supabase/server'

import { LookbookEditor } from '@/components/lookbook/admin/LookbookEditor'
import { TopLoaderReady } from '@/components/TopLoaderReady'

export const dynamic = 'force-dynamic'

const SIGNED_URL_TTL_SECONDS = 60 * 60

export default async function OrgLookbookEditorPage({
    params,
}: {
    params: Promise<{ slug: string; 'lookbook-id': string }>
}) {
    const { slug, 'lookbook-id': lookbookId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Membership + slug match are enforced by [slug]/admin/layout.tsx; resolve
    // the org from the route slug to scope all queries below.
    const service = createServiceClient()
    const { data: org } = await service
        .from('organizations')
        .select('id, slug, name')
        .ilike('slug', slug)
        .maybeSingle()
    if (!org) notFound()

    const { data: lookbook } = await service
        .from('pdf_lookbooks')
        .select('id, slug, title, pdf_url, page_count, published, editor_status, organization_id')
        .eq('id', lookbookId)
        .eq('organization_id', org.id)
        .maybeSingle()
    if (!lookbook) notFound()

    type EditorRow = {
        id: string
        page_number: number
        bbox_x: string | number | null
        bbox_y: string | number | null
        bbox_w: string | number | null
        bbox_h: string | number | null
        match_status: 'needs_review' | 'auto_matched' | 'confirmed' | 'rejected_no_match'
        match_confidence: string | number | null
        inventory_item_id: string | null
        session_visual_description: string | null
        session_visible_text: string | null
        session_position_label: string | null
        admin_notes: string | null
        synced_image_url?: string | null
    }
    const baseItemColumns =
        'id, page_number, bbox_x, bbox_y, bbox_w, bbox_h, ' +
        'match_status, match_confidence, inventory_item_id, ' +
        'session_visual_description, session_visible_text, ' +
        'session_position_label, admin_notes'
    let itemsRaw: unknown = (await service
        .from('pdf_lookbook_items')
        .select(`${baseItemColumns}, synced_image_url`)
        .eq('lookbook_id', lookbook.id)
        .order('page_number', { ascending: true })).data
    if (!itemsRaw) {
        // synced_image_url ships in migration 20260703090000; fall back until
        // it has been applied to this database.
        const retry = await service
            .from('pdf_lookbook_items')
            .select(baseItemColumns)
            .eq('lookbook_id', lookbook.id)
            .order('page_number', { ascending: true })
        itemsRaw = retry.data
    }
    const items = (itemsRaw ?? []) as unknown as EditorRow[]

    type InventoryRow = {
        id: string
        sku: string | null
        name: string | null
        description: string | null
        status: string | null
        category_id: string | null
        collection_id: string | null
        material: string | null
        weight: string | null
        color: string | null
        replacement_cost: number | string | null
        rental_price: number | string | null
        image_paths: string[] | null
        updated_at: string | null
    }
    const { data: categories } = await service
        .from('categories')
        .select('id, name')
        .eq('organization_id', org.id)
        .order('name', { ascending: true })

    const { data: inventory } = await service
        .from('items')
        .select(
            'id, sku, name, description, status, category_id, collection_id, material, weight, color, replacement_cost, rental_price, image_paths, updated_at',
        )
        .eq('organization_id', org.id)
        .eq('status', 'active')
        .order('name', { ascending: true })
        .limit(500)

    let pdfSignedUrl: string | null = null
    if (lookbook.pdf_url) {
        const { data: signed } = await service.storage
            .from('lookbooks')
            .createSignedUrl(lookbook.pdf_url, SIGNED_URL_TTL_SECONDS)
        pdfSignedUrl = signed?.signedUrl ?? null
    }

    return (
        <>
            <TopLoaderReady />
            <LookbookEditor
                orgSlug={org.slug}
                lookbookId={lookbook.id}
                title={lookbook.title}
                pageCount={lookbook.page_count ?? 0}
                pdfSignedUrl={pdfSignedUrl}
                published={!!lookbook.published}
                editorStatus={lookbook.editor_status}
                categories={(categories ?? []) as Array<{ id: string; name: string }>}
                items={items.map(row => ({
                    id: row.id,
                    page_number: row.page_number,
                    bbox_x: row.bbox_x !== null && row.bbox_x !== undefined ? Number(row.bbox_x) : null,
                    bbox_y: row.bbox_y !== null && row.bbox_y !== undefined ? Number(row.bbox_y) : null,
                    bbox_w: row.bbox_w !== null && row.bbox_w !== undefined ? Number(row.bbox_w) : null,
                    bbox_h: row.bbox_h !== null && row.bbox_h !== undefined ? Number(row.bbox_h) : null,
                    match_status: row.match_status,
                    match_confidence: row.match_confidence !== null && row.match_confidence !== undefined ? Number(row.match_confidence) : null,
                    inventory_item_id: row.inventory_item_id,
                    session_visual_description: row.session_visual_description,
                    session_visible_text: row.session_visible_text,
                    session_position_label: row.session_position_label,
                    admin_notes: row.admin_notes,
                    synced_image_url: row.synced_image_url ?? null,
                }))}
                inventory={((inventory ?? []) as unknown as InventoryRow[]).map(it => ({
                    id: it.id,
                    sku: it.sku,
                    name: it.name,
                    description: it.description,
                    status: it.status,
                    category_id: it.category_id,
                    collection_id: it.collection_id,
                    material: it.material,
                    weight: it.weight,
                    color: it.color,
                    replacement_cost: it.replacement_cost !== null && it.replacement_cost !== undefined ? Number(it.replacement_cost) : null,
                    rental_price: it.rental_price !== null && it.rental_price !== undefined ? Number(it.rental_price) : null,
                    image_paths: it.image_paths,
                    updated_at: it.updated_at,
                }))}
            />
        </>
    )
}
