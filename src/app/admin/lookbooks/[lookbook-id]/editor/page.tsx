import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { createClient, createServiceClient } from '@/lib/supabase/server'

import { LookbookEditor } from './LookbookEditor'

export const dynamic = 'force-dynamic'

const SIGNED_URL_TTL_SECONDS = 60 * 60

export default async function LookbookEditorPage({
    params,
}: {
    params: Promise<{ 'lookbook-id': string }>
}) {
    const { 'lookbook-id': lookbookId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const headerList = await headers()
    const orgSlug = headerList.get('x-org-slug')
    if (!orgSlug) notFound()

    const service = createServiceClient()

    const { data: org } = await service
        .from('organizations')
        .select('id, name')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) notFound()

    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle()
    if (!(member?.role === 'owner' || member?.role === 'admin')) {
        // Legacy single-tenant admin fallback (mirrors AdminLayout behaviour).
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        if (profile?.role !== 'admin') redirect('/')
    }

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
    }
    const { data: itemsRaw } = await service
        .from('pdf_lookbook_items')
        .select(
            'id, page_number, bbox_x, bbox_y, bbox_w, bbox_h, ' +
                'match_status, match_confidence, inventory_item_id, ' +
                'session_visual_description, session_visible_text, ' +
                'session_position_label, admin_notes',
        )
        .eq('lookbook_id', lookbook.id)
        .order('page_number', { ascending: true })
    const items = (itemsRaw ?? []) as unknown as EditorRow[]

    const { data: inventory } = await service
        .from('items')
        .select('id, sku, name, rental_price')
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
        <LookbookEditor
            orgSlug={orgSlug}
            lookbookId={lookbook.id}
            title={lookbook.title}
            pageCount={lookbook.page_count ?? 0}
            pdfSignedUrl={pdfSignedUrl}
            published={!!lookbook.published}
            editorStatus={lookbook.editor_status}
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
            }))}
            inventory={(inventory ?? []).map(it => ({
                id: it.id,
                sku: it.sku,
                name: it.name,
                rental_price: it.rental_price !== null && it.rental_price !== undefined ? Number(it.rental_price) : null,
            }))}
        />
    )
}
