import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const supabase = createServiceClient()
    const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('slug', slug.toLowerCase())
        .maybeSingle()
    return { title: org?.name ?? slug }
}

export default async function OrgHomePage({
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

    const { data: lookbooks } = await supabase
        .from('pdf_lookbooks')
        .select('id, slug, title')
        .eq('organization_id', org.id)
        .eq('published', true)
        .eq('editor_status', 'published')
        .order('created_at', { ascending: false })
        .limit(6)

    const cards = [
        {
            title: 'Catalog',
            description: 'Browse the full inventory and request rentals.',
            href: `/${org.slug}/catalog`,
        },
        {
            title: 'Wholesale',
            description: 'Trade pricing for authorized partners.',
            href: `/${org.slug}/wholesale`,
        },
    ]

    return (
        <main id="main-content" tabIndex={-1} className="min-h-screen bg-white">
            <section className="max-w-[1600px] mx-auto px-4 sm:px-8 py-16 sm:py-24 text-center">
                <h1 className="text-3xl sm:text-5xl font-light tracking-wide text-gray-900">
                    {org.name}
                </h1>
                <p className="mt-4 text-sm sm:text-base text-gray-500 max-w-xl mx-auto">
                    Fine jewelry rental and wholesale, curated by {org.name}.
                </p>
            </section>

            <section className="max-w-[1200px] mx-auto px-4 sm:px-8 pb-24">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {cards.map((card) => (
                        <Link
                            key={card.href}
                            href={card.href}
                            className="group block p-8 sm:p-12 border border-gray-100 rounded-md hover:border-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            <h2 className="text-xl font-medium tracking-wide text-gray-900 group-hover:text-gray-700 transition-colors">
                                {card.title}
                            </h2>
                            <p className="mt-3 text-sm text-gray-500">
                                {card.description}
                            </p>
                        </Link>
                    ))}
                </div>

                {lookbooks && lookbooks.length > 0 && (
                    <div className="mt-16">
                        <h2 className="text-sm uppercase tracking-[0.18em] text-gray-500 mb-6">
                            Lookbooks
                        </h2>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {lookbooks.map((lb) => (
                                <li key={lb.id}>
                                    <Link
                                        href={`/${org.slug}/lookbook/${lb.slug ?? lb.id}`}
                                        className="block px-4 py-3 border border-gray-100 rounded-md hover:border-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none"
                                    >
                                        <span className="text-sm text-gray-900">{lb.title}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>
        </main>
    )
}
