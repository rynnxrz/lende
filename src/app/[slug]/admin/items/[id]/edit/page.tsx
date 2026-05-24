import { notFound } from 'next/navigation'
import { getItem } from '@/actions/items'
import { ItemForm } from '@/components/admin/ItemForm'
import { createClient } from '@/lib/supabase/server'

interface Props {
    params: Promise<{ slug: string; id: string }>
}

export default async function OrgEditItemPage({ params }: Props) {
    const { slug, id } = await params
    const basePath = `/${slug}/admin`
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const orgId = user?.app_metadata?.current_org_id as string | undefined

    const [itemResult, { data: categories }, { data: collections }] = await Promise.all([
        getItem(id),
        orgId
            ? supabase.from('categories').select('*').eq('organization_id', orgId).order('name')
            : Promise.resolve({ data: [] }),
        orgId
            ? supabase.from('collections').select('*').eq('organization_id', orgId).order('name')
            : Promise.resolve({ data: [] }),
    ])

    const { data: item, error } = itemResult
    if (error || !item) notFound()

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-foreground">Edit Item</h1>
                <p className="text-muted-foreground">Update item: {item.name}</p>
            </div>
            <ItemForm
                item={item}
                mode="edit"
                categories={categories || []}
                collections={collections || []}
                basePath={basePath}
            />
        </div>
    )
}
