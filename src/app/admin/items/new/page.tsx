import { ItemForm } from '@/components/admin/ItemForm'
import { createClient } from '@/lib/supabase/server'

export default async function NewItemPage() {
    const supabase = await createClient()

    const [
        { data: categories },
        { data: collections }
    ] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('collections').select('*').order('name')
    ])

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
            />
        </div>
    )
}
