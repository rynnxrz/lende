'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Plus } from 'lucide-react'
import type { Item } from '@/types'
import { GroupedItemsList } from './GroupedItemsList'

interface Category {
    id: string
    name: string
}

interface Collection {
    id: string
    name: string
}

interface ItemsPageClientProps {
    items: Item[]
    categories: Category[]
    collections: Collection[]
    isAdmin: boolean
    basePath?: string
    lookbookMatchCountsByItemId?: Record<string, number>
}

export function ItemsPageClient({
    items,
    categories,
    collections,
    isAdmin,
    basePath = '/admin',
    lookbookMatchCountsByItemId,
}: ItemsPageClientProps) {
    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Items"
                description="Manage your rental inventory"
                action={isAdmin && (
                    <Button asChild>
                        <Link href={`${basePath}/items/new`}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Item
                        </Link>
                    </Button>
                )}
            />

            <GroupedItemsList
                initialItems={items}
                isAdmin={isAdmin}
                categories={categories}
                collections={collections}
                basePath={basePath}
                lookbookMatchCountsByItemId={lookbookMatchCountsByItemId}
            />
        </div>
    )
}
