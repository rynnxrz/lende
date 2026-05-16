import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'

export default async function StorefrontLayout({
    children,
    params,
}: {
    children: React.ReactNode
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

    return (
        <>
            <StorefrontHeader orgSlug={org.slug} orgName={org.name} />
            {children}
        </>
    )
}
