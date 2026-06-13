import { createClient } from '@/lib/supabase/server'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { getLookbookCoverage } from '@/lib/lookbook/coverage'

import { LookbookManager } from './_components/LookbookManager'

export const dynamic = 'force-dynamic'

export default async function OrgLookbooksPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = user?.app_metadata?.current_org_id as string | undefined

    const coverage = orgId ? await getLookbookCoverage(orgId) : []

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Lookbooks"
                description="Digitised PDF catalogues — check how each PDF matches your current inventory before publishing."
            />
            <LookbookManager orgSlug={slug} coverage={coverage} />
        </div>
    )
}
