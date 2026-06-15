import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { getLookbookMatchesForItems } from '@/lib/lookbook/item-matches'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const itemId = searchParams.get('itemId')
    if (!itemId) {
        return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = user?.app_metadata?.current_org_id as string | undefined
    if (!user || !orgId) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const matches = await getLookbookMatchesForItems(orgId, [itemId])
    return NextResponse.json({ matches: matches.get(itemId) ?? [] })
}
