import { NextResponse } from 'next/server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: lookbookId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

    const service = createServiceClient()

    const { data: lookbook } = await service
        .from('pdf_lookbooks')
        .select('id, organization_id, slug')
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

    const { error } = await service
        .from('pdf_lookbooks')
        .update({ published: true, editor_status: 'published' })
        .eq('id', lookbookId)
    if (error) {
        return NextResponse.json({ error: 'publish failed', detail: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
