import Link from 'next/link'
import Image from 'next/image'
import { createServiceClient } from '@/lib/supabase/server'

interface Props {
    collectionId: string
    currentId: string
    isArchiveMode: boolean
    orgId: string
    orgSlug: string
}

export async function RelatedItems({ collectionId, currentId, isArchiveMode, orgId, orgSlug }: Props) {
    const supabase = createServiceClient()

    const { data: relatedItems } = await supabase
        .from('items')
        .select('id, name, color, rental_price, image_paths, category, status')
        .eq('organization_id', orgId)
        .eq('collection_id', collectionId)
        .neq('id', currentId)
        .limit(4)

    if (!relatedItems || relatedItems.length === 0) {
        return null
    }

    const getImageUrl = (images: string[] | null) => {
        if (images && images.length > 0) return images[0]
        return 'https://placehold.co/800x600.png?text=No+Image'
    }

    return (
        <section className="mt-24 pt-12 border-t border-gray-100" aria-label="More from this collection">
            <h2 className="text-xl font-semibold tracking-wide uppercase text-center mb-12">More from this Collection</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {relatedItems.map((related) => {
                    const displayName = related.color ? `${related.color} ${related.name}` : related.name
                    return (
                        <Link
                            key={related.id}
                            href={`/${orgSlug}/catalog/${related.id}${isArchiveMode ? '?context=archive' : ''}`}
                            className="group block focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-md"
                            aria-label={`View ${displayName}`}
                        >
                            <div className="relative aspect-square bg-white overflow-hidden rounded-md mb-4">
                                <Image
                                    src={getImageUrl(related.image_paths)}
                                    alt={`${displayName} fine jewelry piece`}
                                    fill
                                    className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
                                    sizes="(max-width: 640px) 100vw, 25vw"
                                />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                                    {displayName}
                                </h3>
                                {!isArchiveMode && (
                                    <p className="text-sm text-gray-700 mt-1">${related.rental_price}</p>
                                )}
                            </div>
                        </Link>
                    )
                })}
            </div>
        </section>
    )
}
