import { notFound } from 'next/navigation'
import { getItem } from '@/actions/items'
import { ItemForm } from '@/components/admin/ItemForm'
import { createClient } from '@/lib/supabase/server'

interface EditItemPageProps {
    params: Promise<{ id: string }>
}

export default async function EditItemPage({ params }: EditItemPageProps) {
    const { id } = await params
    // Check if getItem handles auth internaly or if we should use supabase directly for all?
    // Using existing getItem action is fine for consistency. 
    // But for categories/collections we use supabase direct query as it's simple read.
    const supabase = await createClient()

    const [
        itemResult,
        { data: categories },
        { data: collections }
    ] = await Promise.all([
        getItem(id),
        supabase.from('categories').select('*').order('name'),
        supabase.from('collections').select('*').order('name')
    ])

    const { data: item, error } = itemResult

    if (error || !item) {
        notFound()
    }

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
            />
        </div>
    )
}
