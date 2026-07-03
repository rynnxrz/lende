import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { ArchiveClient } from './ArchiveClient'

export const dynamic = 'force-dynamic'

export default async function OrgArchivePage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const orgSlug = slug.toLowerCase()

    const supabase = createServiceClient()
    const { data: org } = await supabase
        .from('organizations')
        .select('id, slug, name')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) notFound()

    const [
        { data: items, error: itemsError },
        { data: visibleCollections },
        { data: categories },
    ] = await Promise.all([
        supabase
            .from('items')
            .select('id, name, category, rental_price, image_paths, status, collection_id, category_id')
            .eq('organization_id', org.id)
            .neq('status', 'retired')
            .order('created_at', { ascending: false }),
        supabase
            .from('collections')
            .select('id, name')
            .eq('organization_id', org.id)
            .eq('hidden_in_portal', false),
        supabase
            .from('categories')
            .select('id, name')
            .eq('organization_id', org.id),
    ])

    if (itemsError) {
        console.error('Error fetching archive items:', itemsError)
        return <div className="p-8 text-center text-red-500">Failed to load archive.</div>
    }

    // Cascading hiding: items in hidden collections stay out of the archive.
    const visibleCollectionIds = new Set(visibleCollections?.map(c => c.id) || [])
    const validItems = items?.filter(item => {
        if (!item.collection_id) return true
        return visibleCollectionIds.has(item.collection_id)
    }) || []

    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-300 border-r-gray-900"></div>
            </div>
        }>
            <ArchiveClient
                initialItems={validItems}
                categories={categories || []}
                collections={visibleCollections || []}
                orgSlug={org.slug}
            />
        </Suspense>
    )
}
