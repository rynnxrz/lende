import type { Item } from '@/types'
import { ItemsPageClient } from '@/app/admin/items/components/ItemsPageClient'
import { getLookbookMatchCountsForItems } from '@/lib/lookbook/item-matches'
import { withServerTiming } from '@/lib/admin/perf'
import { getOrgAdminContext } from '@/lib/admin/org-context'
import { TopLoaderReady } from '@/components/TopLoaderReady'

export const dynamic = 'force-dynamic'

export default async function OrgItemsPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const basePath = `/${slug}/admin`
    const { supabase, org, member } = await getOrgAdminContext(slug)
    const orgId = org.id
    const isAdmin = member.role === 'owner' || member.role === 'admin'

    const [itemsResult, categoriesResult, collectionsResult] = await withServerTiming('items:list-primary', async () => orgId
        ? await Promise.all([
            supabase
                .from('items')
                .select('id, name, description, sku, status, image_paths, line_type, character_family, side_character, category_id, collection_id, color, material, specs, replacement_cost, rental_price, created_at')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(500),
            supabase.from('categories').select('id, name').eq('organization_id', orgId).order('name'),
            supabase.from('collections').select('id, name').eq('organization_id', orgId).order('name'),
        ])
        : [{ data: [] }, { data: [] }, { data: [] }])

    const items = (itemsResult.data as Item[]) || []
    const matchCountsMap = await withServerTiming('items:lookbook-counts', async () => orgId
        ? await getLookbookMatchCountsForItems(orgId, items.map(i => i.id))
        : new Map<string, number>()
    )

    const lookbookMatchCountsByItemId: Record<string, number> = {}
    for (const [id, count] of matchCountsMap) lookbookMatchCountsByItemId[id] = count

    return (
        <>
            <TopLoaderReady />
            <ItemsPageClient
                items={items}
                categories={categoriesResult.data || []}
                collections={collectionsResult.data || []}
                isAdmin={isAdmin}
                basePath={basePath}
                lookbookMatchCountsByItemId={lookbookMatchCountsByItemId}
            />
        </>
    )
}
