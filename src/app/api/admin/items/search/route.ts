import { NextResponse } from 'next/server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const sku = searchParams.get('sku')?.trim()
    const orgSlug = searchParams.get('org')?.trim()

    if (!sku || !orgSlug) {
        return NextResponse.json({ error: 'missing sku or org' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }

    const service = createServiceClient()
    const { data: org } = await service
        .from('organizations')
        .select('id')
        .ilike('slug', orgSlug)
        .maybeSingle()

    if (!org) {
        return NextResponse.json({ error: 'organization not found' }, { status: 404 })
    }

    const { data: member } = await service
        .from('organization_members')
        .select('role')
        .eq('organization_id', org.id)
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

    const { data: item, error } = await service
        .from('items')
        .select('id, organization_id, sku, name, description, status, category_id, collection_id, material, weight, color, replacement_cost, rental_price, image_paths, updated_at')
        .eq('organization_id', org.id)
        .ilike('sku', sku)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: 'item lookup failed', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ item: item ?? null })
}
