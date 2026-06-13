"use client"

import * as React from "react"
import Link from "next/link"
import { ProductImage } from "@/components/catalog/ProductImage"
import { cn } from "@/lib/utils"
import { Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"

interface Item {
    id: string
    name: string
    category: string
    rental_price: number
    image_paths: string[] | null
    status: string
    category_id?: string | null
    collection_id?: string | null
    color?: string | null
}

interface Category {
    id: string
    name: string
}

interface Collection {
    id: string
    name: string
}

interface ArchiveClientProps {
    initialItems: Item[]
    categories: Category[]
    collections: Collection[]
}

export function ArchiveClient({ initialItems, categories, collections }: ArchiveClientProps) {
    // Filter State
    const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null)
    const [selectedCollectionId, setSelectedCollectionId] = React.useState<string | null>(null)

    // Mobile Calendar State (Used for Filters only here, no calendar)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = React.useState(false)

    // Filter Logic
    const filteredItems = React.useMemo(() => {
        return initialItems.filter(item => {
            if (selectedCategoryId && item.category_id !== selectedCategoryId) return false
            if (selectedCollectionId && item.collection_id !== selectedCollectionId) return false
            return true
        })
    }, [initialItems, selectedCategoryId, selectedCollectionId])

    // Dynamic counts
    const categoryCounts = React.useMemo(() => {
        const counts: Record<string, number> = {}
        const baseItems = selectedCollectionId
            ? initialItems.filter(item => item.collection_id === selectedCollectionId)
            : initialItems
        baseItems.forEach(item => {
            if (item.category_id) {
                counts[item.category_id] = (counts[item.category_id] || 0) + 1
            }
        })
        return counts
    }, [initialItems, selectedCollectionId])

    const collectionCounts = React.useMemo(() => {
        const counts: Record<string, number> = {}
        const baseItems = selectedCategoryId
            ? initialItems.filter(item => item.category_id === selectedCategoryId)
            : initialItems
        baseItems.forEach(item => {
            if (item.collection_id) {
                counts[item.collection_id] = (counts[item.collection_id] || 0) + 1
            }
        })
        return counts
    }, [initialItems, selectedCategoryId])

    const getImageUrl = (images: string[] | null) => {
        if (images && images.length > 0) return images[0]
        return 'https://placehold.co/600x400.png?text=No+Image'
    }

    return (
        <main id="main-content" tabIndex={-1} className="min-h-screen bg-white" aria-label="Archive catalog">
            {/* Layout Container */}
            <div className="max-w-[1920px] mx-auto px-4 sm:px-8 py-8 flex flex-col md:flex-row gap-12">
                <h1 className="sr-only">Archive Catalog</h1>

                {/* Mobile Filter Bar */}
                <nav className="md:hidden sticky top-16 z-30 bg-white/95 backdrop-blur border-b border-slate-100 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar" aria-label="Catalog filters">
                    <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                aria-expanded={isFilterSheetOpen}
                                aria-controls="mobile-filter-drawer"
                                aria-label="Open filters"
                                className="h-11 min-w-[44px] rounded-full px-4 text-xs font-semibold border-slate-300 bg-white shadow-sm flex-shrink-0"
                            >
                                <Filter className="h-4 w-4 mr-2 text-slate-700" aria-hidden="true" />
                                All Filters
                                {(selectedCategoryId || selectedCollectionId) && (
                                    <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white" aria-label="Filters active indicator">
                                        {(selectedCategoryId ? 1 : 0) + (selectedCollectionId ? 1 : 0)}
                                    </span>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="bottom" id="mobile-filter-drawer" className="h-[80vh] rounded-t-xl px-0">
                            <SheetHeader className="px-6 pb-4 border-b">
                                <SheetTitle className="text-left">Filters</SheetTitle>
                                <SheetDescription className="text-left">
                                    Refine your search by category and collection.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="overflow-y-auto h-full px-6 py-6 space-y-8">
                                {/* Categories */}
                                <div>
                                    <h3 className="text-[11px] font-bold text-slate-600 tracking-[0.2em] uppercase mb-3 flex items-center justify-between">
                                        Categories
                                        {selectedCategoryId && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCategoryId(null)}
                                                className="text-[11px] text-slate-700 hover:text-slate-900 transition-colors uppercase font-bold tracking-wide focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </h3>
                                    <div className="space-y-1 pl-4">
                                        {categories.map(cat => (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                                                className={cn(
                                                    "w-full text-left min-h-[44px] px-3 text-sm transition-colors flex items-center justify-between group rounded-md focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none",
                                                    selectedCategoryId === cat.id
                                                        ? "font-semibold text-slate-900 bg-slate-100"
                                                        : "font-normal text-slate-700 hover:text-slate-900"
                                                )}
                                            >
                                                <span>{cat.name}</span>
                                                <span className={cn("text-xs transition-colors", selectedCategoryId === cat.id ? "text-slate-700" : "text-slate-600 group-hover:text-slate-700")}>
                                                    {categoryCounts[cat.id] || 0}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Collections */}
                                <div>
                                    <h3 className="text-[11px] font-bold text-slate-600 tracking-[0.2em] uppercase mb-3 flex items-center justify-between">
                                        Collections
                                        {selectedCollectionId && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCollectionId(null)}
                                                className="text-[11px] text-slate-700 hover:text-slate-900 transition-colors uppercase font-bold tracking-wide focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </h3>
                                    <div className="space-y-1 pl-4">
                                        {collections.map(col => (
                                            <button
                                                key={col.id}
                                                type="button"
                                                onClick={() => setSelectedCollectionId(selectedCollectionId === col.id ? null : col.id)}
                                                className={cn(
                                                    "w-full text-left min-h-[44px] px-3 text-sm transition-colors flex items-center justify-between group rounded-md focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none",
                                                    selectedCollectionId === col.id
                                                        ? "font-semibold text-slate-900 bg-slate-100"
                                                        : "font-normal text-slate-700 hover:text-slate-900"
                                                )}
                                            >
                                                <span>{col.name}</span>
                                                <span className={cn("text-xs transition-colors", selectedCollectionId === col.id ? "text-slate-700" : "text-slate-600 group-hover:text-slate-700")}>
                                                    {collectionCounts[col.id] || 0}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </nav>

                {/* Sidebar Filters */}
                <aside className="hidden md:block w-full md:w-56 flex-shrink-0 pt-2 border-r border-slate-50 pr-2" aria-label="Catalog filters">
                    {/* Categories */}
                    <div className="mb-10">
                        <h3 className="text-[11px] font-bold text-slate-600 tracking-[0.2em] uppercase mb-4 flex items-center justify-between">
                            Categories
                            {selectedCategoryId && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedCategoryId(null)}
                                    className="text-[11px] text-slate-600 hover:text-slate-900 transition-colors uppercase font-bold tracking-wide focus-visible:underline focus-visible:outline-none"
                                >
                                    Reset
                                </button>
                            )}
                        </h3>
                        <div className="space-y-1">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                                    className={cn(
                                        "w-full text-left py-1 text-xs transition-colors flex items-center justify-between group focus-visible:underline focus-visible:outline-none",
                                        selectedCategoryId === cat.id
                                            ? "font-bold text-slate-900"
                                            : "font-normal text-slate-600 hover:text-slate-900"
                                    )}
                                    aria-pressed={selectedCategoryId === cat.id}
                                >
                                    <span>{cat.name}</span>
                                    <span className={cn("text-[10px] transition-colors", selectedCategoryId === cat.id ? "text-slate-900" : "text-slate-500 group-hover:text-slate-600")}>
                                        {categoryCounts[cat.id] || 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Collections */}
                    <div className="mb-10">
                        <h3 className="text-[11px] font-bold text-slate-600 tracking-[0.2em] uppercase mb-4 flex items-center justify-between">
                            Collections
                            {selectedCollectionId && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedCollectionId(null)}
                                    className="text-[11px] text-slate-600 hover:text-slate-900 transition-colors uppercase font-bold tracking-wide focus-visible:underline focus-visible:outline-none"
                                >
                                    Reset
                                </button>
                            )}
                        </h3>
                        <div className="space-y-1">
                            {collections.map(col => (
                                <button
                                    key={col.id}
                                    type="button"
                                    onClick={() => setSelectedCollectionId(selectedCollectionId === col.id ? null : col.id)}
                                    className={cn(
                                        "w-full text-left py-1 text-xs transition-colors flex items-center justify-between group focus-visible:underline focus-visible:outline-none",
                                        selectedCollectionId === col.id
                                            ? "font-bold text-slate-900"
                                            : "font-normal text-slate-600 hover:text-slate-900"
                                    )}
                                    aria-pressed={selectedCollectionId === col.id}
                                >
                                    <span>{col.name}</span>
                                    <span className={cn("text-[10px] transition-colors hidden group-hover:inline-block", selectedCollectionId === col.id ? "inline-block text-slate-900" : "text-slate-500")}>
                                        {collectionCounts[col.id] || 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Grid Section */}
                <section className="flex-1 relative min-h-[500px]" aria-label="Archive results">

                    {/* Grid Content */}
                    <div className="opacity-100">
                        {filteredItems.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-slate-50 border border-slate-50 center-grid">
                                {filteredItems.map((item, index) => {
                                    const displayName = item.color ? `${item.color} ${item.name}` : item.name

                                    return (
                                        <article key={item.id} className="group flex flex-col h-full bg-white relative" aria-label={displayName}>
                                            <Link
                                                href={`/catalog/${item.id}?context=archive`}
                                                aria-label={`View details for ${displayName}`}
                                                className="block group/link focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none rounded-md"
                                            >
                                                {/* Image */}
                                                <ProductImage
                                                    src={getImageUrl(item.image_paths)}
                                                    alt={`${displayName} fine jewelry piece`}
                                                    className="aspect-[4/5] bg-white p-6"
                                                    imgClassName="group-hover/link:scale-105 transition-transform duration-300"
                                                    priority={index < 10}
                                                />

                                                {/* Details (No Price, No Buttons for Archive) */}
                                                <div
                                                    className={cn(
                                                        "px-5 pb-5 pt-1 mt-auto transition-colors hover:bg-slate-50/80 group/action"
                                                    )}
                                                >
                                                    {/* Category */}
                                                    <p className="text-[11px] text-slate-700 truncate uppercase tracking-widest mb-1">
                                                        {item.category}
                                                    </p>
                                                    <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 group-hover/link:text-slate-700 transition-colors text-left">
                                                        {displayName}
                                                    </h3>
                                                </div>
                                            </Link>
                                        </article>
                                    )
                                })}
                                {/* Ghost Cells for Full Grid Fill */}
                                {Array.from({ length: Math.max(12, Math.ceil(filteredItems.length / 4) * 4) - filteredItems.length }).map((_, i) => (
                                    <div key={`ghost-${i}`} className="bg-white" />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20">
                                <h3 className="text-base text-slate-700 font-semibold">
                                    The collection is currently empty.
                                </h3>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    )
}
