"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useRequestStore } from "@/store/request"
import { format, parse } from "date-fns"
import { ShoppingBag, Trash2, Calendar, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetTrigger,
    SheetFooter,
} from "@/components/ui/sheet"
import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
    buildTieredPricingDisplay,
    getTierName,
    MONTHLY_BRIDGE_NOTICE,
    TIER_AMOUNT_UNAVAILABLE_MESSAGE,
} from "@/lib/invoice/tiered-display"
import {
    normalizeBillableDays,
} from "@/lib/invoice/pricing"

// Default fallback org for legacy `/catalog` / `/wholesale` URLs that
// haven't been org-prefixed yet. After Phase B move every storefront URL
// carries the slug as first segment, so this fallback rarely fires.
const DEFAULT_ORG_SLUG = 'ivyjstudio'

function deriveOrgSlug(pathname: string | null): string {
    if (!pathname) return DEFAULT_ORG_SLUG
    const segments = pathname.split('/').filter(Boolean)
    const first = segments[0]
    if (!first) return DEFAULT_ORG_SLUG
    // If first segment looks like a tenant route name, we're on a legacy
    // single-tenant URL like /catalog or /wholesale — fall back to default.
    if (['catalog', 'wholesale', 'admin', 'archive', 'request', 'payment', 'payment-confirmation'].includes(first)) {
        return DEFAULT_ORG_SLUG
    }
    return first
}

export function RequestFloatingButton() {
    const pathname = usePathname()
    const { items, dateRange, removeItem } = useRequestStore()
    const [open, setOpen] = React.useState(false)
    const [isMounted, setIsMounted] = React.useState(false)
    const orgSlug = deriveOrgSlug(pathname)

    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    // Route-based visibility rules
    const shouldShow = React.useMemo(() => {
        // Hide on these routes
        if (pathname === '/') return false
        if (pathname.startsWith('/admin')) return false
        if (pathname.startsWith('/archive')) return false
        if (/^\/[^/]+\/admin\b/.test(pathname)) return false
        if (/^\/[^/]+\/archive\b/.test(pathname)) return false

        // Show on legacy single-tenant /catalog, /wholesale and on the
        // migrated /{slug}/catalog, /{slug}/wholesale storefront routes.
        if (pathname.startsWith('/catalog')) return true
        if (pathname.startsWith('/wholesale')) return true
        if (/^\/[^/]+\/catalog\b/.test(pathname)) return true
        if (/^\/[^/]+\/wholesale\b/.test(pathname)) return true

        // Default: hide
        return false
    }, [pathname])

    // Calculate details
    const hasDates = Boolean(dateRange.from && dateRange.to)
    const fromDate = hasDates ? parse(dateRange.from!, 'yyyy-MM-dd', new Date()) : null
    const toDate = hasDates ? parse(dateRange.to!, 'yyyy-MM-dd', new Date()) : null

    const days = (fromDate && toDate)
        ? normalizeBillableDays(
            Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        )
        : 0
    const durationPricing = buildTieredPricingDisplay({
        replacementCost: null,
        selectedDays: hasDates ? days : null,
    })
    const usesMonthlyBridgeRate = hasDates && durationPricing.isMonthlyBridge

    const itemPricing = items.map((item) => ({
        itemId: item.id,
        display: buildTieredPricingDisplay({
            replacementCost: item.replacement_cost,
            selectedDays: hasDates ? days : null,
        }),
    }))
    const itemPricingById = new Map(itemPricing.map((entry) => [entry.itemId, entry.display]))
    const unavailableEstimateCount = hasDates
        ? itemPricing.filter((entry) => entry.display.selectedEstimate === null).length
        : 0
    const totalCost = itemPricing.reduce((sum, entry) => sum + (entry.display.selectedEstimate ?? 0), 0)

    const getImageUrl = (images: string[] | null) => {
        if (images && images.length > 0) return images[0]
        return 'https://placehold.co/100x100.png?text=No+Img'
    }

    // Bounce animation on item add
    const [isBouncing, setIsBouncing] = React.useState(false)
    const prevCountRef = React.useRef(items.length)

    React.useEffect(() => {
        if (items.length > prevCountRef.current) {
            setIsBouncing(true)
            const timer = setTimeout(() => setIsBouncing(false), 300)
            return () => clearTimeout(timer)
        }
        prevCountRef.current = items.length
    }, [items.length])

    // Don't render if: not mounted, no items, or route doesn't allow
    if (!isMounted || items.length === 0 || !shouldShow) return null

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open request list"
                    aria-expanded={open}
                    aria-controls="request-drawer"
                    className={cn(
                        "relative h-11 w-11 min-w-[44px] rounded-full bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 transition-transform hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                        isBouncing && "scale-125"
                    )}
                >
                    <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                    <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white ring-0 animate-in fade-in zoom-in" />
                </Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col w-full sm:max-w-lg" id="request-drawer" aria-label="Request list">
                <SheetHeader className="border-b pb-4">
                    <SheetTitle>Your Request List</SheetTitle>
                    <SheetDescription>
                        Key items you&#39;ve selected for your rental inquiry.
                    </SheetDescription>
                </SheetHeader>

                {/* Date Summary */}
                <div className="py-4 border-b">
                    <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-md">
                        <Calendar className="h-5 w-5 text-gray-500" />
                        <div>
                            <p className="text-sm font-medium text-gray-900">
                                {hasDates ? (
                                    <>
                                        {format(fromDate!, 'MMM d, yyyy')} - {format(toDate!, 'MMM d, yyyy')}
                                    </>
                                ) : (
                                    <span className="text-red-500">Dates not selected</span>
                                )}
                            </p>
                            {hasDates && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Duration: {days} day{days !== 1 ? 's' : ''} <span className="text-gray-400 ml-1">({getTierName(days)})</span>
                                </p>
                            )}
                            {hasDates && usesMonthlyBridgeRate && (
                                <p className="text-xs text-amber-700 mt-0.5">
                                    {MONTHLY_BRIDGE_NOTICE}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Scrollable List */}
                <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-2">
                    {items.map((item) => (
                        <div key={item.id} className="flex gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors group relative">
                            <div className="relative h-20 w-20 bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                                <Image
                                    src={getImageUrl(item.image_paths)}
                                    alt={`${item.name} fine jewelry piece`}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-between">
                                <div>
                                    <h4 className="font-semibold text-sm text-gray-900 truncate pr-6">{item.name}</h4>
                                    <p className="text-xs text-gray-700 capitalize">{item.category}</p>
                                </div>
                                {(() => {
                                    const tieredPricing = itemPricingById.get(item.id)
                                    if (!tieredPricing) return null

                                    if (tieredPricing.usesPercentageFallback) {
                                        return (
                                            <p className="mt-2 text-xs text-slate-500">
                                                Price unavailable
                                            </p>
                                        )
                                    }

                                    const displayPrice = hasDates && tieredPricing.selectedEstimate !== null
                                        ? tieredPricing.selectedEstimate
                                        : tieredPricing.week1Amount

                                    return (
                                        <p className="mt-2 font-semibold text-sm text-slate-900">
                                            £{displayPrice}
                                        </p>
                                    )
                                })()}
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(item.id)}
                                aria-label={`Remove ${item.name} from request`}
                                className="absolute top-2 right-2 h-11 w-11 min-w-[44px] text-gray-600 hover:text-red-600 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-full"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                        </div>
                    ))}
                </div>

                {/* Footer Actions */}
                <div className="mt-auto border-t pt-4 space-y-4">
                    <div className="flex items-center justify-between text-base font-medium">
                        <span>{hasDates && unavailableEstimateCount > 0 ? 'Estimated Total (available items)' : 'Estimated Total'}</span>
                        <span>£{totalCost.toFixed(2)}</span>
                    </div>
                    {hasDates && unavailableEstimateCount > 0 && (
                        <p className="text-xs text-amber-700">
                            {TIER_AMOUNT_UNAVAILABLE_MESSAGE} ({unavailableEstimateCount} item{unavailableEstimateCount > 1 ? 's' : ''}).
                        </p>
                    )}

                    <SheetFooter>
                        <Link href={`/${orgSlug}/request/summary`} className="w-full" onClick={() => setOpen(false)}>
                            <Button className="w-full h-12 text-base gap-2" disabled={items.length === 0}>
                                Confirm Request
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </SheetFooter>
                </div>
            </SheetContent>
        </Sheet>
    )
}
