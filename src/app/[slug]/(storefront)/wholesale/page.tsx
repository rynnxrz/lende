import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { checkWholesaleAuth } from '@/actions/wholesale'
import { WholesaleGateClient } from './WholesaleGateClient'

export const dynamic = 'force-dynamic'

export default async function WholesalePage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const orgSlug = slug.toLowerCase()

    const supabase = createServiceClient()
    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) notFound()

    // If the visitor already unlocked wholesale for this org, send them
    // straight to catalog in wholesale mode. The cookie name includes the
    // slug so unlocking one org does not leak into others.
    if (await checkWholesaleAuth(orgSlug)) {
        redirect(`/${orgSlug}/catalog?mode=wholesale`)
    }

    return <WholesaleGateClient orgSlug={orgSlug} />
}
