"use client"

import * as React from "react"
import { format, parse } from "date-fns"
import { Calendar as CalendarIcon, Filter } from "lucide-react"
import { DateRange } from "react-day-picker"
import { useRouter, useSearchParams } from "next/navigation"

import { CustomerServiceWidget } from "@/components/customer-service/CustomerServiceWidget"
import { ProductGroupCard } from "@/components/catalog/ProductGroupCard"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { useRequestStore } from "@/store/request"
import { toast } from "sonner"
import { normalizeBillableDays } from "@/lib/invoice/pricing"

interface Item {
    id: string
    name: string
    category: string
    rental_price: number
    replacement_cost?: number | null
    image_paths: string[] | null
    status: string
    category_id?: string | null
    collection_id?: string | null
    color?: string | null
    priority?: number | null
    description?: string | null
    character_family?: string | null
    sku?: string | null
}

interface CatalogVariant {
    id: string
    name: string
    color?: string | null
    image_paths: string[] | null
    rental_price: number
    replacement_cost?: number | null
    sku?: string | null
    category: string
    status: string
}

interface GroupedCatalogItem {
    groupKey: string
    displayName: string
    category: string
    category_id?: string | null
    collection_id?: string | null
    variants: CatalogVariant[]
}

interface Category {
    id: string
    name: string
}

interface Collection {
    id: string
    name: string
}

interface CatalogClientProps {
    initialItems: Item[]
    categories: Category[]
    collections: Collection[]
    orgSlug: string
}

export function CatalogClient({ initialItems, categories, collections, orgSlug }: CatalogClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const catalogBasePath = `/${orgSlug}/catalog`

    // Filter State
    const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null)
    const [selectedCollectionId, setSelectedCollectionId] = React.useState<string | null>(null)

    // === CORE STATE ===
    // "Committed" date - the actively applied search
    const [committedDate, setCommittedDate] = React.useState<DateRange | undefined>(() => {
        const from = searchParams.get('from')
        const to = searchParams.get('to')
        if (from && to) {
            try {
                return {
                    from: parse(from, 'yyyy-MM-dd', new Date()),
                    to: parse(to, 'yyyy-MM-dd', new Date())
                }
            } catch {
                return undefined
            }
        }
        return undefined
    })

    // "Draft" date - temporary selection in calendar before applying
    const [draftDate, setDraftDate] = React.useState<DateRange | undefined>(committedDate)

    // Calendar popover open state
    const [isCalendarOpen, setIsCalendarOpen] = React.useState(false)
    const [activeDateInput, setActiveDateInput] = React.useState<'from' | 'to' | null>(null)

    const { dateRange: globalDateRange, setDateRange: setGlobalDateRange, addItem, hasItem, removeItem } = useRequestStore()
    const [isMounted, setIsMounted] = React.useState(false)

    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    // Sync from Global Store on mount if URL is empty but Store is not
    React.useEffect(() => {
        const from = searchParams.get('from')
        const to = searchParams.get('to')
        if (!from && !to && globalDateRange.from && globalDateRange.to) {
            const parsedDate = {
                from: parse(globalDateRange.from, 'yyyy-MM-dd', new Date()),
                to: parse(globalDateRange.to, 'yyyy-MM-dd', new Date())
            }
            setCommittedDate(parsedDate)
            setDraftDate(parsedDate)
        }
    }, []) // Run once on mount

    // Sync committed date to Global Store
    React.useEffect(() => {
        if (committedDate?.from && committedDate?.to) {
            setGlobalDateRange({
                from: format(committedDate.from, 'yyyy-MM-dd'),
                to: format(committedDate.to, 'yyyy-MM-dd')
            })
        } else if (!committedDate) {
            setGlobalDateRange({ from: null, to: null })
        }
    }, [committedDate, setGlobalDateRange])

    const items = React.useMemo<Item[]>(
        () => initialItems.map(item => ({ ...item, status: 'available' })),
        [initialItems]
    )

    // (Client-side filtering logic is defined below at 'filteredItems')

    // === ACTION HANDLERS ===

    // Apply: Commit draft date, update URL, lock UI
    const handleApplySearch = () => {
        if (!draftDate?.from || !draftDate?.to) {
            toast.error("Please select both start and end dates")
            return
        }

        setCommittedDate(draftDate)
        setIsCalendarOpen(false)
        setActiveDateInput(null)

        // Update URL
        const params = new URLSearchParams(searchParams.toString())
        params.set('from', format(draftDate.from, 'yyyy-MM-dd'))
        params.set('to', format(draftDate.to, 'yyyy-MM-dd'))
        router.replace(`${catalogBasePath}?${params.toString()}`, { scroll: false })
    }

    // Reset: Clear all, unlock UI, return to hero mode
    const handleReset = () => {
        setCommittedDate(undefined)
        setDraftDate(undefined)
        setIsCalendarOpen(false)
        setActiveDateInput(null)

        // Update URL
        const params = new URLSearchParams(searchParams.toString())
        params.delete('from')
        params.delete('to')
        const queryString = params.toString()
        router.replace(queryString ? `${catalogBasePath}?${queryString}` : catalogBasePath, { scroll: false })
    }

    // Open Calendar for specific input
    const openCalendar = (type: 'from' | 'to') => {
        setActiveDateInput(type)
        if (!isCalendarOpen) {
            setDraftDate(committedDate) // Sync only if opening fresh
            setIsCalendarOpen(true)
        }
    }

    const handleCalendarOpenChange = (open: boolean) => {
        setIsCalendarOpen(open)
        if (!open) setActiveDateInput(null)
        else if (!activeDateInput) setActiveDateInput('from') // Default to from
    }

    // === ANCHOR DATE SELECTION LOGIC ===
    const handleDayClick = (day: Date) => {
        if (activeDateInput === 'from') {
            // Always clear End date if we are picking a new Start date, 
            // unless we want to support adjusting start while keeping end.
            // But usually for "Start -> End" flow, we want to jump to End.
            // Let's preserve End if it's valid (after new Start), otherwise clear it.

            const currentTo = draftDate?.to
            const isConflict = currentTo && day > currentTo

            setDraftDate(prev => {
                if (isConflict) {
                    return { from: day, to: undefined }
                }
                // If no conflict, keep existing End (or undefined if it was empty)
                return { from: day, to: prev?.to }
            })

            // REQUEST: "When user is selecting 'Start' date, click auto switch focus to 'End' input."
            // We do this unconditionally now to ensure fluid flow.
            setActiveDateInput('to')

        } else if (activeDateInput === 'to') {
            // Check if user clicked a date BEFORE the current start
            if (draftDate?.from && day < draftDate.from) {
                // REQUEST: "When user is selecting 'End' date, if click date before 'Start', 
                // do not error... auto update this earlier date as new 'Start'."

                // Set this new date as Start, clear End (since we are technically restarting the range from this new point)
                setDraftDate({ from: day, to: undefined })

                // And ensure we are ready to pick the End date
                setActiveDateInput('to')
            } else {
                // Normal End date selection
                setDraftDate(prev => ({ from: prev?.from, to: day }))
                // Stay on 'to' or could close? User didn't specify closing, so we stay.
                setActiveDateInput('to')
            }

        } else {
            // Fallback for when no specific input is active (shouldn't happen often in this UI but good for safety)
            setDraftDate({ from: day, to: undefined })
            setActiveDateInput('to')
        }
    }

    const committedFromDate = committedDate?.from ?? null
    const committedToDate = committedDate?.to ?? null
    const hasCommittedDate = Boolean(committedFromDate && committedToDate)
    const hasDraftComplete = draftDate?.from && draftDate?.to

    // Calculate rental days for display
    const rentalDays = (committedFromDate && committedToDate)
        ? normalizeBillableDays(
            Math.round((committedToDate.getTime() - committedFromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        )
        : null

    // Filter Logic
    const filteredItems = React.useMemo(() => {
        return items.filter(item => {
            if (selectedCategoryId && item.category_id !== selectedCategoryId) return false
            if (selectedCollectionId && item.collection_id !== selectedCollectionId) return false
            return true
        })
    }, [items, selectedCategoryId, selectedCollectionId])

    const groupedItems = React.useMemo<GroupedCatalogItem[]>(() => {
        const groups = new Map<string, GroupedCatalogItem>()

        for (const item of filteredItems) {
            const character = item.character_family?.trim()
            const description = item.description?.trim()
            const name = item.name?.trim()
            const rawGroupKey = character || description || name || item.id
            const normalizedGroupKey = rawGroupKey.toLowerCase()
            const displayName = character || description || name || "Untitled Piece"

            const variant: CatalogVariant = {
                id: item.id,
                name: item.name,
                color: item.color,
                image_paths: item.image_paths,
                rental_price: item.rental_price,
                replacement_cost: item.replacement_cost,
                sku: item.sku,
                category: item.category,
                status: item.status,
            }

            const existing = groups.get(normalizedGroupKey)
            if (existing) {
                existing.variants.push(variant)
                continue
            }

            groups.set(normalizedGroupKey, {
                groupKey: normalizedGroupKey,
                displayName,
                category: item.category,
                category_id: item.category_id,
                collection_id: item.collection_id,
                variants: [variant],
            })
        }

        return Array.from(groups.values())
    }, [filteredItems])

    // Dynamic counts for sidebar (based on current items, respecting collection filter)
    const categoryCounts = React.useMemo(() => {
        const counts: Record<string, number> = {}
        const baseItems = selectedCollectionId
            ? items.filter(item => item.collection_id === selectedCollectionId)
            : items
        baseItems.forEach(item => {
            if (item.category_id) {
                counts[item.category_id] = (counts[item.category_id] || 0) + 1
            }
        })
        return counts
    }, [items, selectedCollectionId])

    const collectionCounts = React.useMemo(() => {
        const counts: Record<string, number> = {}
        const baseItems = selectedCategoryId
            ? items.filter(item => item.category_id === selectedCategoryId)
            : items
        baseItems.forEach(item => {
            if (item.collection_id) {
                counts[item.collection_id] = (counts[item.collection_id] || 0) + 1
            }
        })
        return counts
    }, [items, selectedCategoryId])


    // Mobile Calendar State
    const [isMobileCalendarOpen, setIsMobileCalendarOpen] = React.useState(false)
    const [isFilterSheetOpen, setIsFilterSheetOpen] = React.useState(false)

    // Interaction State
    const [isDateShakeError, setIsDateShakeError] = React.useState(false)

    const triggerDateError = () => {
        setIsDateShakeError(true)
        toast("← Select rental dates first to add items.")
        setTimeout(() => setIsDateShakeError(false), 800)
    }

    const handleMobileCalendarOpenChange = (open: boolean) => {
        setIsMobileCalendarOpen(open)
        if (open) setActiveDateInput('from')
        else setActiveDateInput(null)
    }

    return (
        <main id="main-content" tabIndex={-1} className="min-h-screen bg-white" aria-label="Jewelry catalog">
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }
            `}} />
            {/* Layout Container */}
            <div className="max-w-[1920px] mx-auto px-4 sm:px-8 py-8 flex flex-col md:flex-row gap-12">
                <h1 className="sr-only">Fine jewelry catalog</h1>

                {/* Mobile Filter Bar */}
                <nav className="md:hidden sticky top-16 z-30 bg-white/95 backdrop-blur border-b border-slate-100 -mx-4 sm:-mx-8 px-4 sm:px-8 py-3 mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar" aria-label="Catalog filters and date selection">
                    {/* Mobile Date Picker Trigger */}
                    <Popover open={isMobileCalendarOpen} onOpenChange={handleMobileCalendarOpenChange}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                aria-expanded={isMobileCalendarOpen}
                                aria-controls="mobile-date-popover"
                                aria-label="Select rental dates"
                                className="h-11 min-w-[44px] rounded-full px-4 text-xs font-semibold border-slate-300 bg-white shadow-sm flex-shrink-0"
                            >
                                <CalendarIcon className="h-4 w-4 mr-2 text-slate-700" aria-hidden="true" />
                                {hasCommittedDate
                                    ? `${format(committedDate!.from!, 'MMM d')} - ${format(committedDate!.to!, 'MMM d')}`
                                    : "Select Dates"
                                }
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent id="mobile-date-popover" className="w-[320px] p-0" align="start" sideOffset={8}>
                            {/* Reused Calendar Content - same as desktop but strictly mobile styled if needed. 
                                For DRY, we are duplicating logic here for safety. Ideally refactor to component. */}
                            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                                <div className="flex items-center gap-2 text-sm justify-between">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setActiveDateInput('from')}
                                            className={cn(
                                                "text-xs font-semibold px-3 py-2 rounded bg-white border transition-colors min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none",
                                                activeDateInput === 'from' ? "border-slate-900 ring-1 ring-slate-900 text-slate-900" : "border-slate-300 text-slate-600",
                                                draftDate?.from ? "text-slate-900" : "text-slate-600"
                                            )}
                                        >
                                            {draftDate?.from ? format(draftDate.from, "MMM d") : 'Start'}
                                        </button>
                                        <span className="text-slate-600">→</span>
                                        <button
                                            type="button"
                                            onClick={() => setActiveDateInput('to')}
                                            className={cn(
                                                "text-xs font-semibold px-3 py-2 rounded bg-white border transition-colors min-h-[44px] min-w-[44px] focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none",
                                                activeDateInput === 'to' ? "border-slate-900 ring-1 ring-slate-900 text-slate-900" : "border-slate-300 text-slate-600",
                                                draftDate?.to ? "text-slate-900" : "text-slate-600"
                                            )}
                                        >
                                            {draftDate?.to ? format(draftDate.to, "MMM d") : 'End'}
                                        </button>
                                    </div>
                                    {(draftDate?.from || draftDate?.to) && (
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            className="text-[10px] text-slate-600 hover:text-red-600 uppercase tracking-wider font-semibold focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm"
                                        >
                                            Reset
                                        </button>
                                    )}
                                </div>
                            </div>
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={draftDate?.from || new Date()}
                                selected={draftDate}
                                onDayClick={handleDayClick}
                                numberOfMonths={1}
                                disabled={[
                                    { before: new Date() },
                                    activeDateInput === 'to' && draftDate?.from ? { before: draftDate.from } : { before: new Date() }
                                ]}
                                className="p-3"
                            />
                            <div className="p-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
                                <Button variant="ghost" size="sm" onClick={() => setIsMobileCalendarOpen(false)} className="h-11 min-w-[44px] text-sm">
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        handleApplySearch()
                                        setIsMobileCalendarOpen(false)
                                    }}
                                    disabled={!hasDraftComplete}
                                    className="h-11 min-w-[44px] text-sm bg-slate-900 text-white hover:bg-slate-800"
                                >
                                    Apply
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* All Filters Drawer */}
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
                                {/* 2. Categories */}
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

                                {/* 3. Collections */}
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
                    {/* 1. Rental Dates */}
                    <div style={{ animation: isDateShakeError ? 'shake 0.82s cubic-bezier(.36,.07,.19,.97) both' : 'none' }}>
                        <h3 className="text-[11px] font-bold text-slate-600 tracking-[0.2em] uppercase mb-4 flex items-center justify-between">
                            Rental Dates
                            {hasCommittedDate && (
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="text-[11px] text-slate-600 hover:text-slate-900 transition-colors uppercase font-bold tracking-wide focus-visible:underline focus-visible:outline-none"
                                >
                                    Reset
                                </button>
                            )}
                        </h3>
                        <Popover open={isCalendarOpen} onOpenChange={handleCalendarOpenChange}>
                            <PopoverTrigger asChild>
                                <div className="space-y-3" role="group" aria-label="Rental dates">
                                    {/* Start Date - Frameless with active text state only */}
                                    <button
                                        type="button"
                                        onClick={() => openCalendar('from')}
                                        aria-haspopup="dialog"
                                        aria-expanded={isCalendarOpen}
                                        aria-controls="desktop-date-popover"
                                        className={cn(
                                            "w-full text-left group focus-visible:underline focus-visible:outline-none transition-all duration-150",
                                            isDateShakeError && "ring-2 ring-slate-900 rounded-md"
                                        )}
                                    >
                                        <span className={cn(
                                            "block text-[10px] uppercase tracking-wider font-bold transition-colors",
                                            isCalendarOpen && activeDateInput === 'from' ? "text-slate-900" : "text-slate-600"
                                        )}>Start</span>
                                        <span className={cn(
                                            "text-sm block border-b border-transparent group-hover:border-slate-900 transition-colors pb-0.5",
                                            (isCalendarOpen ? draftDate?.from : committedDate?.from) ? "text-slate-900" : "text-slate-600"
                                        )}>
                                            {(isCalendarOpen ? draftDate?.from : committedDate?.from)
                                                ? format((isCalendarOpen ? draftDate!.from! : committedDate!.from!), "MMM d, yyyy")
                                                : "Select date"}
                                        </span>
                                    </button>

                                    {/* End Date - Frameless with active text state only */}
                                    <button
                                        type="button"
                                        onClick={() => openCalendar('to')}
                                        aria-haspopup="dialog"
                                        aria-expanded={isCalendarOpen}
                                        aria-controls="desktop-date-popover"
                                        className={cn(
                                            "w-full text-left group focus-visible:underline focus-visible:outline-none transition-all duration-150",
                                            isDateShakeError && "ring-2 ring-slate-900 rounded-md"
                                        )}
                                    >
                                        <span className={cn(
                                            "block text-[10px] uppercase tracking-wider font-bold transition-colors",
                                            isCalendarOpen && activeDateInput === 'to' ? "text-slate-900" : "text-slate-600"
                                        )}>End</span>
                                        <span className={cn(
                                            "text-sm block border-b border-transparent group-hover:border-slate-900 transition-colors pb-0.5",
                                            (isCalendarOpen ? draftDate?.to : committedDate?.to) ? "text-slate-900" : "text-slate-600"
                                        )}>
                                            {(isCalendarOpen ? draftDate?.to : committedDate?.to)
                                                ? format((isCalendarOpen ? draftDate!.to! : committedDate!.to!), "MMM d, yyyy")
                                                : "Select date"}
                                        </span>
                                    </button>

                                    {hasCommittedDate && !isCalendarOpen && (
                                        <div>
                                            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.1em]">
                                                {rentalDays ?? 0} days
                                            </span>
                                        </div>
                                    )}

                                </div>
                            </PopoverTrigger>
                            <PopoverContent id="desktop-date-popover" className="w-auto p-0" align="start" side="right" sideOffset={20}>
                                <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                                    <div className="flex items-center gap-2 text-sm justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={cn("text-xs font-semibold px-2 py-1 rounded bg-white border", draftDate?.from ? "text-slate-900" : "text-slate-700")}>
                                                {draftDate?.from ? format(draftDate.from, "MMM d") : 'Start'}
                                            </span>
                                            <span className="text-slate-600">→</span>
                                            <span className={cn("text-xs font-semibold px-2 py-1 rounded bg-white border", draftDate?.to ? "text-slate-900" : "text-slate-700")}>
                                                {draftDate?.to ? format(draftDate.to, "MMM d") : 'End'}
                                            </span>
                                        </div>
                                        {(draftDate?.from || draftDate?.to) && (
                                            <button
                                                type="button"
                                                onClick={handleReset}
                                                className="text-[11px] text-slate-700 hover:text-red-600 uppercase tracking-wider font-semibold focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-sm"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={draftDate?.from || new Date()}
                                    selected={draftDate}
                                    onDayClick={handleDayClick}
                                    numberOfMonths={2}
                                    disabled={[
                                        { before: new Date() },
                                        activeDateInput === 'to' && draftDate?.from ? { before: draftDate.from } : { before: new Date() }
                                    ]}
                                    className="p-3"
                                />
                                <div className="p-3 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
                                    <Button variant="ghost" size="sm" onClick={() => setIsCalendarOpen(false)} className="h-11 min-w-[44px] text-sm">
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleApplySearch}
                                        disabled={!hasDraftComplete}
                                        className="h-11 min-w-[44px] text-sm bg-slate-900 text-white hover:bg-slate-800"
                                    >
                                        Apply
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>

                    </div>

                    {/* 2. Categories */}
                    <div className="mt-10">
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

                    {/* 3. Collections */}
                    <div className="mt-10">
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
                                    <span className={cn("text-[10px] transition-colors", selectedCollectionId === col.id ? "text-slate-900" : "text-slate-500 group-hover:text-slate-600")}>
                                        {collectionCounts[col.id] || 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Grid Section - Sidebar First Layout */}
                <section className="flex-1 relative min-h-[500px]" aria-label="Catalog results">

                    {/* Aligned Header (Desktop Only) */}
                    <div className="hidden md:block mb-6 pt-2">
                        <h2 className="text-[11px] font-bold text-slate-700 tracking-[0.2em] uppercase">
                            Collection Pieces
                        </h2>
                    </div>

                    {/* Grid Content */}
                    <div className="transition-opacity duration-300">
                        {groupedItems.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[1px] bg-slate-50 border border-slate-50 center-grid">
                                {groupedItems.map((group, index) => (
                                    <ProductGroupCard
                                        key={group.groupKey}
                                        group={group}
                                        index={index}
                                        committedDate={hasCommittedDate ? {
                                            from: committedDate!.from!,
                                            to: committedDate!.to!,
                                        } : undefined}
                                        rentalDays={rentalDays}
                                        isMounted={isMounted}
                                        hasItem={hasItem}
                                        addItem={addItem}
                                        removeItem={removeItem}
                                        triggerDateError={triggerDateError}
                                        orgSlug={orgSlug}
                                    />
                                ))}
                                {/* Ghost Cells for Full Grid Fill */}
                                {Array.from({ length: Math.max(12, Math.ceil(groupedItems.length / 4) * 4) - groupedItems.length }).map((_, i) => (
                                    <div key={`ghost-${i}`} className="bg-white" />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20">
                                <h3 className="text-base text-slate-700 font-semibold">
                                    No items match the current filters.
                                </h3>
                            </div>
                        )}
                    </div>
                </section>
            </div>
            <CustomerServiceWidget
                storageKey="customer-service:catalog"
                baseContext={{
                    pageType: 'catalog_list',
                    path: catalogBasePath,
                    orgSlug,
                    catalog: {
                        mode: searchParams.get('mode') === 'wholesale' ? 'wholesale' : 'rental',
                        itemCount: filteredItems.length,
                        selectedCategoryId,
                        selectedCollectionId,
                        dateFrom: committedDate?.from ? format(committedDate.from, 'yyyy-MM-dd') : null,
                        dateTo: committedDate?.to ? format(committedDate.to, 'yyyy-MM-dd') : null,
                    },
                }}
            />
        </main>
    )
}
