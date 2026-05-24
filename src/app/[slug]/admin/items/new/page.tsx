import { ItemForm } from '@/components/admin/ItemForm'
import { createClient } from '@/lib/supabase/server'

export default async function OrgNewItemPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const basePath = `/${slug}/admin`
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = user?.app_metadata?.current_org_id as string | undefined

    const [{ data: categories }, { data: collections }] = orgId
        ? await Promise.all([
            supabase.from('categories').select('*').eq('organization_id', orgId).order('name'),
            supabase.from('collections').select('*').eq('organization_id', orgId).order('name'),
        ])
        : [{ data: [] }, { data: [] }]

    return (
        <div className="max-w-4xl mx-auto p-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground">Add New Item</h1>
                <p className="text-muted-foreground mt-2">Add a new piece to the rental collection.</p>
            </div>
            <ItemForm
                mode="create"
                categories={categories || []}
                collections={collections || []}
                basePath={basePath}
            />
        </div>
    )
}
