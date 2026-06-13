import { createClient } from '@/lib/supabase/server'
import type { Item } from '@/types'
import { ItemsPageClient } from '@/app/admin/items/components/ItemsPageClient'
import { getLookbookMatchesForItems, type LookbookMatch } from '@/lib/lookbook/item-matches'

export const dynamic = 'force-dynamic'

export default async function OrgItemsPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const basePath = `/${slug}/admin`
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = user?.app_metadata?.current_org_id as string | undefined

    const [itemsResult, categoriesResult, collectionsResult] = orgId
        ? await Promise.all([
            supabase.from('items').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
            supabase.from('categories').select('id, name').eq('organization_id', orgId).order('name'),
            supabase.from('collections').select('id, name').eq('organization_id', orgId).order('name'),
        ])
        : [{ data: [] }, { data: [] }, { data: [] }]

    const items = (itemsResult.data as Item[]) || []
    const matchesMap = orgId
        ? await getLookbookMatchesForItems(orgId, items.map(i => i.id))
        : new Map<string, LookbookMatch[]>()

    const lookbookMatchesByItemId: Record<string, LookbookMatch[]> = {}
    for (const [id, matches] of matchesMap) lookbookMatchesByItemId[id] = matches

    return (
        <ItemsPageClient
            items={items}
            categories={categoriesResult.data || []}
            collections={collectionsResult.data || []}
            isAdmin={true}
            basePath={basePath}
            lookbookMatchesByItemId={lookbookMatchesByItemId}
        />
    )
}
