'use client'

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Edit, Filter, Package, WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Collapsible,
    CollapsibleContent,
} from '@/components/ui/collapsible'
import { bulkUpdateItems, bulkUpdateItemStatus, runItemTaxonomyBackfill } from '@/actions/items'
import type { Item, ItemLineType } from '@/types'
import { OFFICIAL_CHARACTERS } from '@/lib/items/catalog-rules'
import { DeleteItemButton } from '../DeleteItemButton'

interface GroupedItemsListProps {
    initialItems: Item[]
    isAdmin: boolean
    categories: { id: string; name: string }[]
    collections: { id: string; name: string }[]
    basePath?: string
}

type StatusFilter = 'all' | 'active' | 'maintenance' | 'retired'

type CharacterGroup = {
    key: string
    character: string
    sideCharacter: string
    items: Item[]
}

const LINE_TABS: ItemLineType[] = ['Mainline', 'Collaboration', 'Archive']

const statusVariant = (status: Item['status']) => {
    switch (status) {
        case 'active':
            return 'default'
        case 'maintenance':
            return 'secondary'
        case 'retired':
            return 'outline'
        default:
            return 'default'
    }
}

const normalizeLineType = (lineType?: string | null): ItemLineType => {
    if (lineType === 'Collaboration' || lineType === 'Archive') return lineType
    return 'Mainline'
}

const getItemSize = (item: Item): string => {
    if (!item.specs || typeof item.specs !== 'object') return '-'

    const size = (item.specs as Record<string, unknown>).size
    if (typeof size === 'string' && size.trim()) return size.trim()

    return '-'
}

type SelectionCheckboxProps = {
    checked: boolean
    indeterminate?: boolean
    onChange: (checked: boolean) => void
    ariaLabel: string
}

function SelectionCheckbox({ checked, indeterminate = false, onChange, ariaLabel }: SelectionCheckboxProps) {
    const ref = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        if (!ref.current) return
        ref.current.indeterminate = indeterminate
    }, [indeterminate])

    return (
        <input
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={event => onChange(event.target.checked)}
            aria-label={ariaLabel}
            className="h-4 w-4 rounded border-input text-foreground focus:ring-ring accent-foreground"
        />
    )
}

export function GroupedItemsList({ initialItems, isAdmin, categories, collections, basePath = '/admin' }: GroupedItemsListProps) {
    const router = useRouter()
    const [lineFilter, setLineFilter] = useState<ItemLineType>('Mainline')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
    const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
    const [updatingGroup, setUpdatingGroup] = useState<string | null>(null)
    const [isBackfillPending, startBackfillTransition] = useTransition()
    const [isBulkPending, startBulkTransition] = useTransition()
    const [isBulkEditPending, startBulkEditTransition] = useTransition()
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
    const [bulkReplacementCost, setBulkReplacementCost] = useState('')
    const [bulkCharacterFamily, setBulkCharacterFamily] = useState('')
    const [bulkSideCharacter, setBulkSideCharacter] = useState('')

    const categoryMap = useMemo(() => {
        return new Map(categories.map(category => [category.id, category.name]))
    }, [categories])

    const collectionMap = useMemo(() => {
        return new Map(collections.map(collection => [collection.id, collection.name]))
    }, [collections])

    const lineCounts = useMemo(() => {
        return initialItems.reduce(
            (acc, item) => {
                acc[normalizeLineType(item.line_type)] += 1
                return acc
            },
            {
                Mainline: 0,
                Collaboration: 0,
                Archive: 0,
            } as Record<ItemLineType, number>
        )
    }, [initialItems])

    const filteredItems = useMemo(() => {
        return initialItems.filter(item => {
            if (normalizeLineType(item.line_type) !== lineFilter) {
                return false
            }

            if (statusFilter === 'all') return true
            return item.status === statusFilter
        })
    }, [initialItems, lineFilter, statusFilter])

    const groupedCharacters = useMemo<CharacterGroup[]>(() => {
        const groups = new Map<string, Item[]>()
        const missingCharacterLabel = 'Needs Character'
        const defaultSideCharacterLabel = 'General'

        for (const item of filteredItems) {
            const character = (item.character_family || '').trim() || missingCharacterLabel
            const sideCharacter = (item.side_character || '').trim() || defaultSideCharacterLabel
            const key = `${character}::${sideCharacter}`
            const existing = groups.get(key)
            if (existing) {
                existing.push(item)
            } else {
                groups.set(key, [item])
            }
        }

        return Array.from(groups.entries())
            .map(([compositeKey, items]) => {
                const sortedItems = [...items].sort((a, b) => {
                    const sideCompare = (a.side_character || '').localeCompare(b.side_character || '')
                    if (sideCompare !== 0) return sideCompare
                    return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
                })
                const [character, sideCharacter] = compositeKey.split('::')

                return {
                    key: compositeKey.toLowerCase(),
                    character,
                    sideCharacter,
                    items: sortedItems,
                }
            })
            .sort((a, b) => {
                if (a.character === missingCharacterLabel) return 1
                if (b.character === missingCharacterLabel) return -1
                const characterCompare = a.character.localeCompare(b.character)
                if (characterCompare !== 0) return characterCompare
                return a.sideCharacter.localeCompare(b.sideCharacter)
            })
    }, [filteredItems])

    const filteredItemIds = useMemo(() => {
        return filteredItems.map(item => item.id)
    }, [filteredItems])

    const selectedCount = selectedItemIds.size
    const selectedVisibleCount = useMemo(() => {
        return filteredItemIds.reduce((count, id) => count + (selectedItemIds.has(id) ? 1 : 0), 0)
    }, [filteredItemIds, selectedItemIds])
    const allVisibleSelected = filteredItemIds.length > 0 && selectedVisibleCount === filteredItemIds.length
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

    useEffect(() => {
        const visibleIds = new Set(filteredItemIds)
        setSelectedItemIds(prev => {
            const next = new Set<string>()
            for (const id of prev) {
                if (visibleIds.has(id)) next.add(id)
            }
            return next
        })
    }, [filteredItemIds])

    const toggleGroup = (groupKey: string) => {
        setOpenGroups(prev => {
            const next = new Set(prev)
            if (next.has(groupKey)) next.delete(groupKey)
            else next.add(groupKey)
            return next
        })
    }

    const toggleItemSelection = (itemId: string, checked: boolean) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev)
            if (checked) next.add(itemId)
            else next.delete(itemId)
            return next
        })
    }

    const toggleAllVisible = (checked: boolean) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev)
            if (checked) {
                for (const id of filteredItemIds) next.add(id)
            } else {
                for (const id of filteredItemIds) next.delete(id)
            }
            return next
        })
    }

    const toggleGroupSelection = (group: CharacterGroup, checked: boolean) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev)
            for (const item of group.items) {
                if (checked) next.add(item.id)
                else next.delete(item.id)
            }
            return next
        })
    }

    const handleBulkStatus = (group: CharacterGroup, status: 'active' | 'retired') => {
        if (!isAdmin) return

        const confirmed = window.confirm(
            status === 'active'
                ? `Mark all ${group.items.length} items in ${group.character} / ${group.sideCharacter} as active?`
                : `Retire all ${group.items.length} items in ${group.character} / ${group.sideCharacter}?`
        )

        if (!confirmed) return

        startBulkTransition(() => {
            void (async () => {
                try {
                    setUpdatingGroup(group.key)
                    const result = await bulkUpdateItemStatus(
                        group.items.map(item => item.id),
                        status
                    )

                    if (!result.success) {
                        toast.error(result.error || 'Failed to update items')
                        return
                    }

                    toast.success(status === 'active' ? 'Character group activated' : 'Character group retired')
                    router.refresh()
                } catch (error) {
                    console.error('Bulk status update failed', error)
                    toast.error('Failed to update items')
                } finally {
                    setUpdatingGroup(null)
                }
            })()
        })
    }

    const handleRunBackfill = () => {
        if (!isAdmin) return

        startBackfillTransition(() => {
            void (async () => {
                try {
                    const result = await runItemTaxonomyBackfill()
                    if (!result.success) {
                        toast.error(result.error || 'Backfill failed')
                        return
                    }

                    const summary = result.summary || {
                        'Orchid Whisper': 0,
                        'Daffodils Blossom': 0,
                    }

                    toast.success(
                        `Character backfill complete: ${result.updated}/${result.total} items updated (Orchid Whisper ${summary['Orchid Whisper']}, Daffodils Blossom ${summary['Daffodils Blossom']})`
                    )
                    router.refresh()
                } catch (error) {
                    console.error('Backfill failed', error)
                    toast.error('Backfill failed')
                }
            })()
        })
    }

    const handleBulkApply = () => {
        if (!isAdmin || selectedCount === 0) return

        const hasReplacementCost = bulkReplacementCost.trim().length > 0
        const hasCharacterFamily = bulkCharacterFamily.trim().length > 0
        const hasSideCharacter = bulkSideCharacter.trim().length > 0

        if (!hasReplacementCost && !hasCharacterFamily && !hasSideCharacter) {
            toast.error('Please fill at least one field to update')
            return
        }

        const updates: {
            replacement_cost?: number
            character_family?: string
            side_character?: string
        } = {}
        const summary: string[] = []

        if (hasReplacementCost) {
            const parsed = Number(bulkReplacementCost)
            if (!Number.isFinite(parsed) || parsed <= 0) {
                toast.error('RRP must be greater than 0')
                return
            }
            updates.replacement_cost = parsed
            summary.push(`RRP -> £${parsed.toFixed(2)} (daily rental auto recalculated)`)
        }

        if (hasCharacterFamily) {
            updates.character_family = bulkCharacterFamily
            summary.push(`Character -> ${bulkCharacterFamily}`)
        }

        if (hasSideCharacter) {
            updates.side_character = bulkSideCharacter
            summary.push(`Side Character -> ${bulkSideCharacter.trim()}`)
        }

        const confirmed = window.confirm(
            `Apply updates to ${selectedCount} item(s)?\n\n${summary.join('\n')}`
        )
        if (!confirmed) return

        startBulkEditTransition(() => {
            void (async () => {
                try {
                    const result = await bulkUpdateItems(Array.from(selectedItemIds), updates)
                    if (!result.success) {
                        toast.error(result.error || 'Failed to update items')
                        return
                    }

                    toast.success(`Updated ${selectedCount} item(s)`)
                    setSelectedItemIds(new Set())
                    setBulkReplacementCost('')
                    setBulkCharacterFamily('')
                    setBulkSideCharacter('')
                    router.refresh()
                } catch (error) {
                    console.error('Bulk item update failed', error)
                    toast.error('Failed to update items')
                }
            })()
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-border pb-3">
                <div className="space-y-3">
                    <nav className="flex flex-wrap gap-2">
                        {LINE_TABS.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setLineFilter(tab)}
                                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                                    lineFilter === tab
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-input text-foreground hover:border-ring'
                                }`}
                            >
                                {tab}
                                <span className="ml-2 text-xs opacity-80">{lineCounts[tab]}</span>
                            </button>
                        ))}
                    </nav>
                    <p className="text-xs text-muted-foreground">Grouped by Character and Side Character in the selected line.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 rounded-md border border-input px-2 py-1">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <select
                            value={statusFilter}
                            onChange={event => setStatusFilter(event.target.value as StatusFilter)}
                            className="bg-transparent text-sm text-foreground focus:outline-none"
                        >
                            <option value="all">All statuses</option>
                            <option value="active">Active</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="retired">Retired</option>
                        </select>
                    </div>
                    {isAdmin && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleRunBackfill}
                            disabled={isBackfillPending}
                        >
                            <WandSparkles className="mr-2 h-4 w-4" />
                            {isBackfillPending ? 'Running Backfill...' : 'Backfill Character Names'}
                        </Button>
                    )}
                </div>
            </div>

            {isAdmin && selectedCount > 0 && (
                <div className="rounded-md border border-border bg-muted/50 p-4">
                    <div className="mb-3 text-sm font-medium text-foreground">
                        Bulk Edit ({selectedCount} selected)
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                        <div className="space-y-1">
                            <label htmlFor="bulk-rrp" className="text-xs text-muted-foreground">RRP (£)</label>
                            <input
                                id="bulk-rrp"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={bulkReplacementCost}
                                onChange={event => setBulkReplacementCost(event.target.value)}
                                placeholder="e.g. 200"
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="bulk-character" className="text-xs text-muted-foreground">Character</label>
                            <select
                                id="bulk-character"
                                value={bulkCharacterFamily}
                                onChange={event => setBulkCharacterFamily(event.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="">No change</option>
                                {OFFICIAL_CHARACTERS.map(character => (
                                    <option key={character} value={character}>
                                        {character}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="bulk-side-character" className="text-xs text-muted-foreground">Side Character</label>
                            <input
                                id="bulk-side-character"
                                type="text"
                                value={bulkSideCharacter}
                                onChange={event => setBulkSideCharacter(event.target.value)}
                                placeholder="No change"
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <Button
                            type="button"
                            onClick={handleBulkApply}
                            disabled={isBulkEditPending}
                        >
                            {isBulkEditPending ? 'Saving...' : 'Apply & Save'}
                        </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Only filled fields will be updated. RRP updates will auto-recalculate daily rental price.
                    </p>
                </div>
            )}

            {groupedCharacters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                    <Package className="h-10 w-10 text-muted-foreground/60" />
                    <h3 className="mt-4 text-base font-medium text-foreground">No items found in this view.</h3>
                </div>
            ) : (
                <div className="rounded-md border border-border">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="w-[40px]">
                                    {isAdmin && (
                                        <SelectionCheckbox
                                            checked={allVisibleSelected}
                                            indeterminate={someVisibleSelected}
                                            onChange={toggleAllVisible}
                                            ariaLabel="Select all visible items"
                                        />
                                    )}
                                </TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Character</TableHead>
                                <TableHead>Side Character</TableHead>
                                <TableHead>SKUs</TableHead>
                                <TableHead>Jewelry Type Mix</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {groupedCharacters.map(group => {
                                const selectedInGroup = group.items.filter(item => selectedItemIds.has(item.id)).length
                                const allInGroupSelected = group.items.length > 0 && selectedInGroup === group.items.length
                                const someInGroupSelected = selectedInGroup > 0 && !allInGroupSelected
                                const groupCategories = Array.from(
                                    new Set(
                                        group.items
                                            .map(item => item.category_id ? categoryMap.get(item.category_id) : undefined)
                                            .filter((value): value is string => Boolean(value))
                                    )
                                )

                                return (
                                    <Fragment key={group.key}>
                                        <TableRow className="hover:bg-muted/40">
                                            <TableCell>
                                                {isAdmin && (
                                                    <SelectionCheckbox
                                                        checked={allInGroupSelected}
                                                        indeterminate={someInGroupSelected}
                                                        onChange={checked => toggleGroupSelection(group, checked)}
                                                        ariaLabel={`Select group ${group.character} / ${group.sideCharacter}`}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => toggleGroup(group.key)}
                                                    className="h-8 w-8 p-0"
                                                >
                                                    {openGroups.has(group.key)
                                                        ? <ChevronDown className="h-4 w-4" />
                                                        : <ChevronRight className="h-4 w-4" />}
                                                </Button>
                                            </TableCell>
                                            <TableCell className="font-medium">{group.character}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="font-normal">
                                                    {group.sideCharacter}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="font-normal">
                                                    {group.items.length}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {groupCategories.length > 0 ? groupCategories.map(category => (
                                                        <Badge key={`${group.key}-${category}`} variant="outline" className="font-normal">
                                                            {category}
                                                        </Badge>
                                                    )) : <span className="text-muted-foreground/70 text-sm">-</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {isAdmin && (
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleBulkStatus(group, 'active')}
                                                            disabled={isBulkPending && updatingGroup === group.key}
                                                        >
                                                            Mark Active
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleBulkStatus(group, 'retired')}
                                                            disabled={isBulkPending && updatingGroup === group.key}
                                                        >
                                                            Retire All
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>

                                        <Collapsible open={openGroups.has(group.key)} asChild>
                                            <TableRow className="border-0 p-0 hover:bg-transparent">
                                                <TableCell colSpan={7} className="p-0">
                                                    <CollapsibleContent>
                                                        <div className="border-b border-border bg-muted/30 p-4 pl-12">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow className="border-b-border/50 hover:bg-transparent">
                                                                        <TableHead className="h-8 w-10 text-xs"></TableHead>
                                                                        <TableHead className="h-8 w-12 text-xs">Image</TableHead>
                                                                        <TableHead className="h-8 text-xs">SKU</TableHead>
                                                                        <TableHead className="h-8 text-xs">Description</TableHead>
                                                                        <TableHead className="h-8 text-xs">Side Character</TableHead>
                                                                        <TableHead className="h-8 text-xs">Jewelry Type</TableHead>
                                                                        <TableHead className="h-8 text-xs">Website Collection</TableHead>
                                                                        <TableHead className="h-8 text-xs">Size</TableHead>
                                                                        <TableHead className="h-8 text-xs">Color</TableHead>
                                                                        <TableHead className="h-8 text-xs">Material</TableHead>
                                                                        <TableHead className="h-8 text-right text-xs">RRP</TableHead>
                                                                        <TableHead className="h-8 text-xs">Status</TableHead>
                                                                        <TableHead className="h-8 text-right text-xs">Actions</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {group.items.map(item => (
                                                                        <TableRow key={item.id} className="border-b-border/50 hover:bg-background">
                                                                            <TableCell className="py-2">
                                                                                {isAdmin && (
                                                                                    <SelectionCheckbox
                                                                                        checked={selectedItemIds.has(item.id)}
                                                                                        onChange={checked => toggleItemSelection(item.id, checked)}
                                                                                        ariaLabel={`Select item ${item.sku || item.name}`}
                                                                                    />
                                                                                )}
                                                                            </TableCell>
                                                                            <TableCell className="py-2">
                                                                                {item.image_paths && item.image_paths.length > 0 ? (
                                                                                    <Image
                                                                                        src={item.image_paths[0]}
                                                                                        alt={item.name}
                                                                                        width={32}
                                                                                        height={32}
                                                                                        className={`rounded object-cover shadow-sm ${item.status === 'retired' ? 'bg-muted grayscale' : 'bg-background'}`}
                                                                                        unoptimized
                                                                                    />
                                                                                ) : (
                                                                                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                                                                                        <Package className="h-3 w-3 text-muted-foreground" />
                                                                                    </div>
                                                                                )}
                                                                            </TableCell>
                                                                            <TableCell className="py-2 font-mono text-xs text-muted-foreground">{item.sku || '-'}</TableCell>
                                                                            <TableCell className="py-2 text-sm font-medium">{item.description || item.name || '-'}</TableCell>
                                                                            <TableCell className="py-2 text-sm">{item.side_character || '-'}</TableCell>
                                                                            <TableCell className="py-2 text-sm">{item.category_id ? categoryMap.get(item.category_id) || '-' : '-'}</TableCell>
                                                                            <TableCell className="py-2 text-sm">{item.collection_id ? collectionMap.get(item.collection_id) || '-' : '-'}</TableCell>
                                                                            <TableCell className="py-2 text-sm">{getItemSize(item)}</TableCell>
                                                                            <TableCell className="py-2 text-sm">{item.color || '-'}</TableCell>
                                                                            <TableCell className="py-2 text-sm">{item.material || '-'}</TableCell>
                                                                            <TableCell className="py-2 text-right font-medium text-sm">
                                                                                {Number(item.replacement_cost) > 0
                                                                                    ? `£${Number(item.replacement_cost).toFixed(2)}`
                                                                                    : <span className="text-amber-700">RRP missing</span>}
                                                                            </TableCell>
                                                                            <TableCell className="py-2">
                                                                                <Badge variant={statusVariant(item.status)} className="h-5 px-1.5 text-[10px]">
                                                                                    {item.status}
                                                                                </Badge>
                                                                            </TableCell>
                                                                            <TableCell className="py-2 text-right">
                                                                                {isAdmin && (
                                                                                    <div className="flex justify-end gap-1">
                                                                                        {statusFilter !== 'retired' && (
                                                                                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                                                                                <Link href={`${basePath}/items/${item.id}/edit`}>
                                                                                                    <Edit className="h-3.5 w-3.5" />
                                                                                                </Link>
                                                                                            </Button>
                                                                                        )}
                                                                                        <DeleteItemButton itemId={item.id} itemName={item.name} />
                                                                                    </div>
                                                                                )}
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </CollapsibleContent>
                                                </TableCell>
                                            </TableRow>
                                        </Collapsible>
                                    </Fragment>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}
