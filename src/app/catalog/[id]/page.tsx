import { createServiceClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ItemDetailClient } from './ItemDetailClient'
import { RelatedItems } from './RelatedItems'
import { RelatedItemsSkeleton } from '@/components/skeletons/RelatedItemsSkeleton'
import { Suspense } from 'react'

interface Props {
    params: Promise<{ id: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Force dynamic rendering — orgSlug comes from per-request header.
export const dynamic = 'force-dynamic'

const DEFAULT_ORG_SLUG = 'ivyjstudio'

export default async function ItemDetailPage({ params, searchParams }: Props) {
    const { id } = await params
    const { context } = await searchParams

    const headerList = await headers()
    const orgSlug = (headerList.get('x-org-slug') ?? DEFAULT_ORG_SLUG).toLowerCase()

    const supabase = createServiceClient()
    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) notFound()

    const { data: item, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .eq('organization_id', org.id)
        .single()

    if (error || !item) {
        notFound()
    }

    // Determine group key for fetching variants. Always scope by
    // organization_id so a sibling org's item with the same
    // character_family / description / name doesn't leak into the
    // variant group (cross-tenant data leak otherwise).
    const character = item.character_family?.trim()
    const description = item.description?.trim()
    const name = item.name?.trim()
    const itemGroupKey = (character || description || name || item.id).toLowerCase()

    let variantsQuery = supabase
        .from('items')
        .select('*')
        .eq('organization_id', org.id)
    if (character) {
        variantsQuery = variantsQuery.eq('character_family', character)
    } else if (description) {
        variantsQuery = variantsQuery.eq('description', description)
    } else if (name) {
        variantsQuery = variantsQuery.eq('name', name)
    } else {
        variantsQuery = variantsQuery.eq('id', item.id)
    }

    const { data: rawVariants } = await variantsQuery
    const variants = rawVariants?.filter(v => {
        const vCharacter = v.character_family?.trim()
        const vDescription = v.description?.trim()
        const vName = v.name?.trim()
        const vKey = (vCharacter || vDescription || vName || v.id).toLowerCase()
        return vKey === itemGroupKey
    }) || []

    const contextValue = typeof context === 'string' ? context : undefined
    const isArchiveMode = contextValue === 'archive'

    return (
        <ItemDetailClient
            item={item}
            variants={variants}
            context={contextValue}
            orgSlug={orgSlug}
            relatedItemsSlot={
                item.collection_id ? (
                    <Suspense fallback={<RelatedItemsSkeleton />}>
                        <RelatedItems
                            collectionId={item.collection_id}
                            currentId={item.id}
                            isArchiveMode={isArchiveMode}
                            orgId={org.id}
                            orgSlug={orgSlug}
                        />
                    </Suspense>
                ) : null
            }
        />
    )
}
