import { Suspense } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { CatalogClient } from '../CatalogClient'

// Force dynamic rendering so we always resolve the per-request org from
// the x-org-slug header (middleware sets it on rewrites from /{slug}/catalog).
export const dynamic = 'force-dynamic'

// Per-org cached data fetcher. Cache key includes orgId so different
// tenants get separate cache entries.
const buildCachedCatalogFetcher = (orgId: string) =>
    unstable_cache(
        async () => {
            const supabase = createServiceClient()
            return Promise.all([
                supabase
                    .from('items')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('status', 'active')
                    .order('priority', { ascending: false })
                    .order('created_at', { ascending: false }),
                supabase
                    .from('categories')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('hidden_in_portal', false)
                    .order('name'),
                supabase
                    .from('collections')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('hidden_in_portal', false)
                    .order('name')
            ])
        },
        ['catalog-data-v2', orgId],
        { revalidate: 60, tags: [`catalog-${orgId}`] }
    )

const DEFAULT_ORG_SLUG = 'ivyjstudio'

export default async function CatalogPage() {
    // Resolve org from middleware-injected header; fall back to default
    // tenant for legacy /catalog requests (which middleware 301-redirects
    // to /ivyjstudio/catalog then rewrites back here in Phase A).
    const headerList = await headers()
    const orgSlug = (headerList.get('x-org-slug') ?? DEFAULT_ORG_SLUG).toLowerCase()

    const supabase = createServiceClient()
    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) notFound()

    // Parallel filters fetch (cached per-org)
    let allItems, visibleCategories, visibleCollections
    try {
        const [
            { data: items, error: itemsError },
            { data: cats },
            { data: cols }
        ] = await buildCachedCatalogFetcher(org.id)()

        if (itemsError) throw itemsError

        allItems = items
        visibleCategories = cats
        visibleCollections = cols
    } catch (error) {
        console.error('CRITICAL: Failed to load catalog data', error)
        // Return a safe fallback UI instead of crashing the entire app
        return (
            <div className="min-h-screen pt-24 pb-12 px-4 sm:px-8 max-w-[1920px] mx-auto text-center">
                <h1 className="text-2xl font-light tracking-widest text-red-900 mb-4">SYSTEM UNAVAILABLE</h1>
                <p className="text-slate-600 mb-6">Unable to load the jewelry collection at this time.</p>
                <div className="text-xs text-slate-400 font-mono bg-slate-50 p-4 rounded inline-block text-left">
                    <p>Error Digest: {Date.now()}</p>
                    <p>Please contact support.</p>
                </div>
            </div>
        )
    }

    // Cascading Hiding: Filter out items that belong to hidden collections
    // (If collection_id is set, it must exist in the visibleCollections list)
    // We also treat items with no collection as visible (unless other rules apply)
    const visibleCollectionIds = new Set(visibleCollections?.map(c => c.id) || [])

    const validItems = allItems?.filter(item => {
        // If item has no collection, it's visible
        if (!item.collection_id) return true
        // If item has collection, it must be in visible list
        return visibleCollectionIds.has(item.collection_id)
    }) || []

    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-gray-900"></div>
            </div>
        }>
            <CatalogClient
                initialItems={validItems}
                categories={visibleCategories || []}
                collections={visibleCollections || []}
                orgSlug={orgSlug}
            />
        </Suspense>
    )
}
