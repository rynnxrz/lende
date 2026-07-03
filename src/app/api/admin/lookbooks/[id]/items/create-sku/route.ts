import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient, createServiceClient } from '@/lib/supabase/server'

const BodySchema = z.object({
    sku: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().nullable().optional(),
    jewelry_type: z.string().trim().nullable().optional(),
    size: z.string().trim().nullable().optional(),
    material: z.string().trim().nullable().optional(),
    color: z.string().trim().nullable().optional(),
    weight: z.string().trim().nullable().optional(),
    replacement_cost: z.number().finite().nullable().optional(),
    image_url: z.string().min(1),
})

const ITEM_COLUMNS =
    'id, organization_id, sku, name, description, status, category_id, collection_id, material, weight, color, replacement_cost, rental_price, image_paths, specs, updated_at'

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
        body = BodySchema.parse(await request.json())
    } catch (err) {
        return NextResponse.json(
            { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
            { status: 400 },
        )
    }

    let categoryId: string | null = null
    if (body.jewelry_type) {
        // Same normalisation as ItemForm ("Earring" matches "Earrings").
        const singularize = (value: string) => {
            const normalized = value.toLowerCase().replace(/\s+/g, '')
            return normalized.endsWith('s') ? normalized.slice(0, -1) : normalized
        }
        const { data: categories } = await service
            .from('categories')
            .select('id, name')
            .eq('organization_id', lookbook.organization_id)
        categoryId = (categories ?? []).find(c => singularize(c.name) === singularize(body.jewelry_type!))?.id ?? null
    }

    const specs = body.size ? { size: body.size } : null

    // Same rental derivation as ItemForm: weekly rate 15% of RRP, daily = /7.
    const rrp = body.replacement_cost ?? 0
    const rentalPrice = Math.round(((Math.max(0, rrp) * 0.15) / 7 + Number.EPSILON) * 100) / 100

    const { data: created, error } = await service
        .from('items')
        .insert({
            organization_id: lookbook.organization_id,
            sku: body.sku,
            name: body.name,
            description: body.description ?? null,
            category_id: categoryId,
            specs,
            material: body.material ?? null,
            color: body.color ?? null,
            weight: body.weight ?? null,
            image_paths: [body.image_url],
            rental_price: rentalPrice,
            replacement_cost: rrp,
            status: 'active',
        })
        .select(ITEM_COLUMNS)
        .single()

    if (error) {
        if (error.code === '23505') {
            return NextResponse.json(
                { error: 'sku already exists', detail: `SKU "${body.sku}" is already taken` },
                { status: 409 },
            )
        }
        return NextResponse.json({ error: 'item create failed', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ item: created })
}
