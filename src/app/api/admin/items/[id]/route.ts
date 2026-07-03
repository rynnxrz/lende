import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient, createServiceClient } from '@/lib/supabase/server'

type RouteParams = { id: string }

// Mirrors ItemForm's category comparison: lowercase, no spaces, singular.
function singularizeTypeName(value: string) {
    const normalized = value.toLowerCase().replace(/\s+/g, '')
    return normalized.endsWith('s') ? normalized.slice(0, -1) : normalized
}

const PatchSchema = z.object({
    sku: z.string().trim().min(1).optional().nullable(),
    name: z.string().trim().min(1).optional().nullable(),
    description: z.string().optional().nullable(),
    category_id: z.string().uuid().optional().nullable(),
    jewelry_type: z.string().trim().optional().nullable(),
    collection_id: z.string().uuid().optional().nullable(),
    material: z.string().optional().nullable(),
    weight: z.string().optional().nullable(),
    color: z.string().optional().nullable(),
    size: z.string().trim().optional().nullable(),
    rental_price: z.number().finite().optional().nullable(),
    replacement_cost: z.number().finite().optional().nullable(),
    image_paths: z.array(z.string().min(1)).optional().nullable(),
    status: z.enum(['active', 'maintenance', 'retired']).optional(),
})

export async function GET(
    _request: Request,
    { params }: { params: Promise<RouteParams> },
) {
    const { id: itemId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }

    const service = createServiceClient()
    const { data: item, error: itemError } = await service
        .from('items')
        .select(
            'id, organization_id, sku, name, description, status, category_id, collection_id, material, weight, color, replacement_cost, rental_price, image_paths, specs, updated_at',
        )
        .eq('id', itemId)
        .maybeSingle()

    if (itemError) {
        return NextResponse.json({ error: 'item lookup failed', detail: itemError.message }, { status: 500 })
    }

    if (!item) {
        return NextResponse.json({ error: 'item not found' }, { status: 404 })
    }

    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', item.organization_id)
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

    if (!isAdmin) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    return NextResponse.json({
        item: {
            id: item.id,
            organization_id: item.organization_id,
            sku: item.sku,
            name: item.name,
            description: item.description,
            status: item.status,
            category_id: item.category_id,
            collection_id: item.collection_id,
            material: item.material,
            weight: item.weight,
            color: item.color,
            replacement_cost: item.replacement_cost,
            rental_price: item.rental_price,
            image_paths: item.image_paths,
            specs: item.specs,
            updated_at: item.updated_at,
        },
    })
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<RouteParams> },
) {
    const { id: itemId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }

    const service = createServiceClient()
    const { data: item } = await service
        .from('items')
        .select('id, organization_id, status, specs')
        .eq('id', itemId)
        .maybeSingle()

    if (!item) {
        return NextResponse.json({ error: 'item not found' }, { status: 404 })
    }

    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', item.organization_id)
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

    if (!isAdmin) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    if (item.status !== 'active') {
        return NextResponse.json({ error: 'item not syncable', detail: 'item must be active before sync' }, { status: 400 })
    }

    let raw: unknown
    try {
        raw = await request.json()
    } catch {
        return NextResponse.json({ error: 'invalid body', detail: 'request body must be JSON' }, { status: 400 })
    }

    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'invalid body', detail: parsed.error.flatten() },
            { status: 400 },
        )
    }

    const { jewelry_type: jewelryType, size, ...itemPatch } = parsed.data
    const patch: Record<string, unknown> = Object.fromEntries(
        Object.entries(itemPatch).filter(([, value]) => value !== undefined),
    )

    if (jewelryType === null) {
        patch.category_id = null
    } else if (jewelryType) {
        // Same normalisation as ItemForm ("Earring" matches "Earrings"); if
        // nothing resolves, leave the item's existing category untouched.
        const { data: categories } = await service
            .from('categories')
            .select('id, name')
            .eq('organization_id', item.organization_id)
        const match = (categories ?? []).find(c => singularizeTypeName(c.name) === singularizeTypeName(jewelryType))
        if (match) patch.category_id = match.id
    }

    if (size !== undefined) {
        const specs = item.specs && typeof item.specs === 'object' && !Array.isArray(item.specs)
            ? { ...(item.specs as Record<string, unknown>) }
            : {}
        patch.specs = size ? { ...specs, size } : specs
    }

    if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'no changes requested' }, { status: 400 })
    }

    const { data: updated, error } = await service
        .from('items')
        .update(patch)
        .eq('id', itemId)
        .select(
            'id, organization_id, sku, name, description, status, category_id, collection_id, material, weight, color, replacement_cost, rental_price, image_paths, specs, updated_at',
        )
        .single()

    if (error) {
        return NextResponse.json({ error: 'item update failed', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ item: updated })
}
