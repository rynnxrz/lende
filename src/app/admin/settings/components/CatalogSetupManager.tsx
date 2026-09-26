'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { Category, Collection } from '@/types'
import { toggleCategoryVisibility, toggleCollectionVisibility, deleteCategory, deleteCollection, createCategory, createCollection } from '../actions'
import { AlertCircle, Trash2, Plus, Loader2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface CatalogSetupManagerProps {
    categories: Category[]
    collections: Collection[]
}

export default function CatalogSetupManager({ categories, collections }: CatalogSetupManagerProps) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [newItemName, setNewItemName] = useState('')
    const [dialogOpen, setDialogOpen] = useState<'category' | 'collection' | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'collection', id: string, name: string } | null>(null)
    const [isDeleting, startDeleteTransition] = useTransition()

    const handleCreate = async (type: 'category' | 'collection') => {
        if (!newItemName.trim() || isCreating) return

        const itemLabel = type === 'category' ? 'jewelry type' : 'website collection'
        setIsCreating(true)
        setError(null)
        try {
            if (type === 'category') {
                await createCategory(newItemName.trim())
            } else {
                const result = await createCollection(newItemName.trim())
                if (!result.success) {
                    const message = result.error || 'Could not add this website collection.'
                    setError(message)
                    toast.error(message)
                    return
                }
            }
            toast.success(`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} added`)
            setDialogOpen(null)
            setNewItemName('')
            router.refresh()
        } catch (err) {
            setError(`Could not add this ${itemLabel}.`)
            console.error(err)
            toast.error(`Could not add this ${itemLabel}.`)
        } finally {
            setIsCreating(false)
        }
    }

    const handleCategoryToggle = async (id: string, currentHidden: boolean) => {
        try {
            await toggleCategoryVisibility(id, !currentHidden)
            toast.success(currentHidden ? 'Jewelry type is now visible in website filters' : 'Jewelry type hidden from website filters')
            router.refresh()
        } catch (err) {
            setError('Could not update jewelry type visibility.')
            console.error(err)
            toast.error('Could not update jewelry type visibility.')
        }
    }

    const handleCollectionToggle = async (id: string, currentHidden: boolean) => {
        try {
            await toggleCollectionVisibility(id, !currentHidden)
            toast.success(currentHidden ? 'Website collection is now visible in website filters' : 'Website collection hidden from website filters')
            router.refresh()
        } catch (err) {
            setError('Could not update website collection visibility.')
            console.error(err)
            toast.error('Could not update website collection visibility.')
        }
    }

    const handleDeleteCategory = (id: string, name: string) => {
        setDeleteTarget({ type: 'category', id, name })
    }

    const handleDeleteCollection = (id: string, name: string) => {
        setDeleteTarget({ type: 'collection', id, name })
    }

    const confirmDelete = () => {
        if (!deleteTarget) return

        startDeleteTransition(() => {
            void (async () => {
                try {
                    if (deleteTarget.type === 'category') {
                        await deleteCategory(deleteTarget.id)
                        toast.success('Jewelry type removed')
                    } else {
                        await deleteCollection(deleteTarget.id)
                        toast.success('Website collection removed')
                    }
                    router.refresh()
                } catch (error) {
                    console.error(error)
                    setError(`Could not remove this ${deleteTarget.type === 'category' ? 'jewelry type' : 'website collection'}.`)
                    toast.error(`Could not remove this ${deleteTarget.type === 'category' ? 'jewelry type' : 'website collection'}.`)
                }
                setDeleteTarget(null)
            })()
        })
    }

    return (
        <div className="space-y-6">
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {/* Jewelry Types */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                            <CardTitle>Jewelry Types</CardTitle>
                            <CardDescription>
                                Choose which jewelry types appear in the website filters.
                            </CardDescription>
                        </div>
                        <Dialog open={dialogOpen === 'category'} onOpenChange={(open) => setDialogOpen(open ? 'category' : null)}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Jewelry Type</DialogTitle>
                                    <DialogDescription>Create a new jewelry type for your items.</DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <Label htmlFor="cat-name" className="mb-2 block">Name</Label>
                                    <Input
                                        id="cat-name"
                                        value={newItemName}
                                        onChange={(e) => setNewItemName(e.target.value)}
                                        placeholder="e.g., Rings"
                                    />
                                </div>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setDialogOpen(null)}>Cancel</Button>
                                    <Button onClick={() => handleCreate('category')} disabled={isCreating}>Create</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        {categories.map((category) => (
                            <div key={category.id} className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                                <div className="space-y-0.5 max-w-[200px]">
                                    <Label className="text-base break-words">{category.name}</Label>
                                    <div className="text-sm text-muted-foreground">
                                        {category.hidden_in_portal ? 'Hidden' : 'Visible'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Switch
                                        checked={!category.hidden_in_portal}
                                        onCheckedChange={() => handleCategoryToggle(category.id, category.hidden_in_portal)}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteCategory(category.id, category.name)}
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {categories.length === 0 && (
                            <p className="text-sm text-muted-foreground">No jewelry types found.</p>
                        )}
                    </CardContent>
                </Card>

                {/* Website Collections */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                            <CardTitle>Website Collections</CardTitle>
                            <CardDescription>
                                Choose which website collections appear in the website filters.
                            </CardDescription>
                        </div>
                        <Dialog open={dialogOpen === 'collection'} onOpenChange={(open) => {
                            if (isCreating) return
                            setDialogOpen(open ? 'collection' : null)
                            setNewItemName('')
                            setError(null)
                        }}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Website Collection</DialogTitle>
                                    <DialogDescription>Create a new website collection for your items.</DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                    <Label htmlFor="col-name" className="mb-2 block">Name</Label>
                                    <Input
                                        id="col-name"
                                        value={newItemName}
                                        onChange={(e) => setNewItemName(e.target.value)}
                                        placeholder="e.g., Summer 2024"
                                        disabled={isCreating}
                                        aria-invalid={!!error}
                                        aria-describedby={error ? 'collection-create-error' : undefined}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                                event.preventDefault()
                                                void handleCreate('collection')
                                            }
                                        }}
                                    />
                                    {error && <p id="collection-create-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
                                </div>
                                <DialogFooter>
                                    <Button type="button" variant="outline" disabled={isCreating} onClick={() => setDialogOpen(null)}>Cancel</Button>
                                    <Button type="button" onClick={() => handleCreate('collection')} disabled={isCreating || !newItemName.trim()}>
                                        {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {isCreating ? 'Creating...' : 'Create'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        {collections.map((collection) => (
                            <div key={collection.id} className="flex items-center justify-between space-x-2 rounded-lg border p-4">
                                <div className="space-y-0.5 max-w-[200px]">
                                    <Label className="text-base break-words">{collection.name}</Label>
                                    <div className="text-sm text-muted-foreground">
                                        {collection.hidden_in_portal ? 'Hidden' : 'Visible'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Switch
                                        checked={!collection.hidden_in_portal}
                                        onCheckedChange={() => handleCollectionToggle(collection.id, collection.hidden_in_portal)}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteCollection(collection.id, collection.name)}
                                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {collections.length === 0 && (
                            <p className="text-sm text-muted-foreground">No website collections found.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {deleteTarget?.type === 'category' ? 'Jewelry Type' : 'Website Collection'}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
