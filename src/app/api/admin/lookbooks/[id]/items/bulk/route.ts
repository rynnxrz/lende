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
    synced_image_url: z.string().nullable().optional(),
})
    .superRefine((value, ctx) => {
        if (value.match_status !== 'confirmed') return

        if (!value.inventory_item_id) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['inventory_item_id'],
                message: 'confirmed matches must have an inventory_item_id',
            })
        }

        if (
            value.bbox_x === null ||
            value.bbox_y === null ||
            value.bbox_w === null ||
            value.bbox_h === null
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['bbox_x'],
                message: 'confirmed matches must have a bounding box',
            })
        }
    })

const BodySchema = z.object({
    updates: z.array(ItemUpdateSchema).max(500),
    deletes: z.array(z.string().uuid()).max(500).optional(),
})

function badRequest(detail: string, path?: string) {
    return NextResponse.json(
        { error: 'invalid confirmation', detail, path },
        { status: 400 },
    )
}

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

    const inventoryIds = Array.from(
        new Set(
            body.updates
                .map(update => update.inventory_item_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
    )

    if (inventoryIds.length > 0) {
        const { data: inventoryRows, error: inventoryError } = await service
            .from('items')
            .select('id, organization_id, status, image_paths')
            .in('id', inventoryIds)

        if (inventoryError) {
            return NextResponse.json(
                { error: 'inventory lookup failed', detail: inventoryError.message },
                { status: 500 },
            )
        }

        const inventoryById = new Map(
            (inventoryRows ?? []).map(row => [row.id as string, row as {
                id: string
                organization_id: string
                status: string
                image_paths: string[] | null
            }]),
        )

        for (const update of body.updates) {
            if (!update.inventory_item_id) continue

            const item = inventoryById.get(update.inventory_item_id)
            if (!item) {
                return badRequest(
                    `inventory item ${update.inventory_item_id} no longer exists for this organization`,
                    'inventory_item_id',
                )
            }
            if (item.organization_id !== lookbook.organization_id) {
                return badRequest(
                    `inventory item ${update.inventory_item_id} does not belong to this organization`,
                    'inventory_item_id',
                )
            }
            if (item.status !== 'active') {
                return badRequest(
                    `inventory item ${update.inventory_item_id} is not active`,
                    'inventory_item_id',
                )
            }
            if (!Array.isArray(item.image_paths) || item.image_paths.length === 0) {
                return badRequest(
                    `inventory item ${update.inventory_item_id} has no storefront images`,
                    'inventory_item_id',
                )
            }
        }
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
            synced_image_url: u.synced_image_url ?? null,
        }
        if (u.id) {
            updates.push({ id: u.id, patch: row })
        } else {
            inserts.push(row)
        }
    }

    // synced_image_url ships in migration 20260703090000; retry without it
    // until that migration reaches this database.
    const stripSynced = (row: Record<string, unknown>) => {
        const { synced_image_url: _ignored, ...rest } = row
        return rest
    }
    const missingSyncedColumn = (message: string) => message.includes('synced_image_url')

    let insertedRows: Array<Record<string, unknown>> = []
    if (inserts.length > 0) {
        let { data, error } = await service.from('pdf_lookbook_items').insert(inserts).select('*')
        if (error && missingSyncedColumn(error.message)) {
            ({ data, error } = await service.from('pdf_lookbook_items').insert(inserts.map(stripSynced)).select('*'))
        }
        if (error) {
            return NextResponse.json({ error: 'insert failed', detail: error.message }, { status: 500 })
        }
        insertedRows = data ?? []
    }

    const updatedRows: Array<Record<string, unknown>> = []
    for (const { id, patch } of updates) {
        let { data, error } = await service
            .from('pdf_lookbook_items')
            .update(patch)
            .eq('id', id)
            .eq('lookbook_id', lookbookId)
            .select('*')
            .maybeSingle()
        if (error && missingSyncedColumn(error.message)) {
            ({ data, error } = await service
                .from('pdf_lookbook_items')
                .update(stripSynced(patch))
                .eq('id', id)
                .eq('lookbook_id', lookbookId)
                .select('*')
                .maybeSingle())
        }
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
