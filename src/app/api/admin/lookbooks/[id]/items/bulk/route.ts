import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient, createServiceClient } from '@/lib/supabase/server'

const Bbox = z.union([z.number(), z.null()])
const MatchStatus = z.enum(['needs_review', 'auto_matched', 'confirmed', 'rejected_no_match'])

const ItemUpdateSchema = z.object({
    id: z.string().uuid().nullable(),
    page_number: z.number().int().positive(),
    bbox_x: Bbox,
    bbox_y: Bbox,
    bbox_w: Bbox,
    bbox_h: Bbox,
    match_status: MatchStatus,
    match_confidence: z.union([z.number(), z.null()]).optional(),
    inventory_item_id: z.string().uuid().nullable(),
    admin_notes: z.string().nullable().optional(),
})

const BodySchema = z.object({
    updates: z.array(ItemUpdateSchema).max(500),
    deletes: z.array(z.string().uuid()).max(500).optional(),
})

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: lookbookId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

    const service = createServiceClient()

    const { data: lookbook } = await service
        .from('pdf_lookbooks')
        .select('id, organization_id')
        .eq('id', lookbookId)
        .maybeSingle()
    if (!lookbook) return NextResponse.json({ error: 'lookbook not found' }, { status: 404 })

    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', lookbook.organization_id)
        .eq('user_id', user.id)
        .maybeSingle()
    let isAdmin = member?.role === 'owner' || member?.role === 'admin'
    if (!isAdmin) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        isAdmin = profile?.role === 'admin'
    }
    if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    let body: z.infer<typeof BodySchema>
    try {
        const json = await request.json()
        body = BodySchema.parse(json)
    } catch (err) {
        return NextResponse.json(
            { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
            { status: 400 },
        )
    }

    const inserts: Array<Record<string, unknown>> = []
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
    for (const u of body.updates) {
        const row = {
            lookbook_id: lookbookId,
            page_number: u.page_number,
            bbox_x: u.bbox_x,
            bbox_y: u.bbox_y,
            bbox_w: u.bbox_w,
            bbox_h: u.bbox_h,
            match_status: u.match_status,
            match_confidence: u.match_confidence ?? null,
            inventory_item_id: u.inventory_item_id,
            admin_notes: u.admin_notes ?? null,
        }
        if (u.id) {
            updates.push({ id: u.id, patch: row })
        } else {
            inserts.push(row)
        }
    }

    let insertedRows: Array<Record<string, unknown>> = []
    if (inserts.length > 0) {
        const { data, error } = await service.from('pdf_lookbook_items').insert(inserts).select('*')
        if (error) {
            return NextResponse.json({ error: 'insert failed', detail: error.message }, { status: 500 })
        }
        insertedRows = data ?? []
    }

    const updatedRows: Array<Record<string, unknown>> = []
    for (const { id, patch } of updates) {
        const { data, error } = await service
            .from('pdf_lookbook_items')
            .update(patch)
            .eq('id', id)
            .eq('lookbook_id', lookbookId)
            .select('*')
            .maybeSingle()
        if (error) {
            return NextResponse.json({ error: 'update failed', detail: error.message }, { status: 500 })
        }
        if (data) updatedRows.push(data)
    }

    if (body.deletes && body.deletes.length > 0) {
        const { error } = await service
            .from('pdf_lookbook_items')
            .delete()
            .eq('lookbook_id', lookbookId)
            .in('id', body.deletes)
        if (error) {
            return NextResponse.json({ error: 'delete failed', detail: error.message }, { status: 500 })
        }
    }

    return NextResponse.json({
        ok: true,
        items: [...insertedRows, ...updatedRows],
        deleted: body.deletes?.length ?? 0,
    })
}
