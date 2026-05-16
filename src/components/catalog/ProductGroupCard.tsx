"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { format } from "date-fns"
import { Check } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    buildTieredPricingDisplay,
    buildTierSummaryText,
    TIER_AMOUNT_UNAVAILABLE_MESSAGE,
    WEEKLY_EXTENSION_NOTICE,
} from "@/lib/invoice/tiered-display"

export interface CatalogVariant {
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

export interface GroupedCatalogItem {
    groupKey: string
    displayName: string
    category: string
    category_id?: string | null
    collection_id?: string | null
    variants: CatalogVariant[]
}

interface ProductGroupCardProps {
    group: GroupedCatalogItem
    index: number
    committedDate?: { from: Date; to: Date }
    rentalDays: number | null
    isMounted: boolean
    hasItem: (itemId: string) => boolean
    addItem: (item: {
        id: string
        name: string
        category: string
        rental_price: number
        replacement_cost?: number | null
        image_paths: string[] | null
        status: string
    }) => void
    removeItem: (itemId: string) => void
    triggerDateError: () => void
    orgSlug: string
}

const COLOR_HEX_MAP: Record<string, string> = {
    black: "#111827",
    white: "#f8fafc",
    silver: "#cbd5e1",
    gold: "#ca8a04",
    rose: "#f472b6",
    pink: "#ec4899",
    red: "#dc2626",
    orange: "#f97316",
    yellow: "#facc15",
    green: "#22c55e",
    emerald: "#10b981",
    teal: "#14b8a6",
    blue: "#2563eb",
    navy: "#1e3a8a",
    purple: "#8b5cf6",
    violet: "#7c3aed",
    turquoise: "#14b8a6",
    brown: "#92400e",
    burgundy: "#7f1d1d",
    clear: "#e2e8f0",
    crystal: "#dbeafe",
}

function getImageUrl(images: string[] | null) {
    if (images && images.length > 0) return images[0]
    return "https://placehold.co/600x400.png?text=No+Image"
}

function getColorHexesFromText(colorText: string): string[] {
    const matches = Object.entries(COLOR_HEX_MAP)
        .map(([token, hex]) => ({ token, hex, index: colorText.indexOf(token) }))
        .filter((match) => match.index >= 0)
        .sort((a, b) => a.index - b.index)

    const uniqueHexes: string[] = []
    for (const match of matches) {
        if (!uniqueHexes.includes(match.hex)) {
            uniqueHexes.push(match.hex)
        }
    }

    return uniqueHexes
}

export function resolveSwatchStyle(variant: CatalogVariant): React.CSSProperties {
    const colorText = (variant.color || "").toLowerCase()
    const matchedHexes = getColorHexesFromText(colorText)

    if (matchedHexes.length >= 2) {
        const [firstHex, secondHex] = matchedHexes
        return {
            background: `linear-gradient(135deg, ${firstHex} 0%, ${firstHex} 48%, ${secondHex} 52%, ${secondHex} 100%)`,
        }
    }

    if (matchedHexes.length === 1) {
        return { backgroundColor: matchedHexes[0] }
    }

    const imageUrl = getImageUrl(variant.image_paths)
    if (!imageUrl.includes("placehold.co")) {
        return {
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        }
    }

    return { backgroundColor: "#cbd5e1" }
}

export function normalizeValue(value: string): string {
    return value.trim().toLowerCase()
}

export function getVariantSize(variant: CatalogVariant | { specs: Record<string, unknown> | null }): string | null {
    const specs = (variant as any).specs
    if (!specs || typeof specs !== "object") return null

    for (const [key, rawValue] of Object.entries(specs)) {
        if (normalizeValue(key) !== "size") continue
        if (typeof rawValue !== "string") return null
        const normalized = rawValue.trim()
        return normalized.length > 0 ? normalized : null
    }

    return null
}

export function getSwatchStyleKey(style: React.CSSProperties): string {
    const background = typeof style.background === "string" ? style.background.trim().toLowerCase() : ""
    if (background) return `background:${background}`

    const backgroundColor = typeof style.backgroundColor === "string" ? style.backgroundColor.trim().toLowerCase() : ""
    if (backgroundColor) return `backgroundColor:${backgroundColor}`

    const backgroundImage = typeof style.backgroundImage === "string" ? style.backgroundImage.trim().toLowerCase() : ""
    if (backgroundImage) return `backgroundImage:${backgroundImage}`

    return "background:default"
}

export function getVariantSwatchKey(variant: CatalogVariant): string {
    return getSwatchStyleKey(resolveSwatchStyle(variant))
}

export function buildUniqueSwatchVariants<T extends CatalogVariant>(
    variants: T[],
    activeVariantId?: string,
    referenceSizeKey?: string | null
): { variant: T; isAvailable: boolean }[] {
    const buckets = new Map<string, T[]>()

    for (const variant of variants) {
        const swatchKey = getVariantSwatchKey(variant)
        const existing = buckets.get(swatchKey)
        if (existing) {
            existing.push(variant)
            continue
        }
        buckets.set(swatchKey, [variant])
    }

    return Array.from(buckets.entries()).map(([, bucket]) => {
        const picked = activeVariantId 
            ? (bucket.find((v) => v.id === activeVariantId) || bucket[0])
            : bucket[0]
            
        const isAvailable = referenceSizeKey 
            ? bucket.some(v => normalizeValue(getVariantSize(v) || "") === referenceSizeKey)
            : true

        return {
            variant: picked,
            isAvailable,
            bucketSize: bucket.length,
        }
    }).sort((a, b) => {
        // 1. Colors compatible with the current size come first
        if (a.isAvailable && !b.isAvailable) return -1
        if (!a.isAvailable && b.isAvailable) return 1
        // 2. Within the same availability group, colors with more DB variants (broader size coverage) come first
        return b.bucketSize - a.bucketSize
    })
}

export function ProductGroupCard({
    group,
    index,
    committedDate,
    rentalDays,
    isMounted,
    hasItem,
    addItem,
    removeItem,
    triggerDateError,
    orgSlug,
}: ProductGroupCardProps) {
    const [activeVariant, setActiveVariant] = React.useState<CatalogVariant>(group.variants[0])
    const [hoverVariant, setHoverVariant] = React.useState<CatalogVariant | null>(null)
    const [supportsHover, setSupportsHover] = React.useState(false)

    React.useEffect(() => {
        setActiveVariant(group.variants[0])
        setHoverVariant(null)
    }, [group.groupKey, group.variants])

    React.useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return
        setSupportsHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches)
    }, [])

    const previewVariant = hoverVariant ?? activeVariant
    const uniqueSwatchVariants = React.useMemo(
        () => buildUniqueSwatchVariants(
            group.variants, 
            activeVariant.id, 
            normalizeValue(getVariantSize(activeVariant) || "")
        ),
        [group.variants, activeVariant.id, activeVariant]
    )
    const displayColor = activeVariant.color?.trim() || "Default"
    const variantLabel = activeVariant.color?.trim()
        ? `${activeVariant.color} ${group.displayName}`
        : group.displayName

    const isSelected = isMounted && hasItem(activeVariant.id)
    const tieredPricing = buildTieredPricingDisplay({
        replacementCost: activeVariant.replacement_cost,
        selectedDays: rentalDays,
    })
    const tierSummaryText = buildTierSummaryText(tieredPricing)
    const pricingAriaLabel = tieredPricing.usesPercentageFallback
        ? `Tiered rental pricing. ${tierSummaryText}. ${WEEKLY_EXTENSION_NOTICE}. ${TIER_AMOUNT_UNAVAILABLE_MESSAGE}.`
        : `Tiered rental pricing. ${tierSummaryText}. ${WEEKLY_EXTENSION_NOTICE}.`

    const detailBase = `/${orgSlug}/catalog/${activeVariant.id}`
    const href = committedDate
        ? `${detailBase}?start=${format(committedDate.from, "yyyy-MM-dd")}&end=${format(committedDate.to, "yyyy-MM-dd")}`
        : detailBase

    return (
        <article className="group flex flex-col h-full bg-white relative" aria-label={variantLabel}>
            <Link
                href={href}
                aria-label={`View details for ${variantLabel}`}
                className="block group/link focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none rounded-md"
            >
                <div className="relative aspect-[4/5] bg-white overflow-hidden p-10">
                    <Image
                        src={getImageUrl(previewVariant.image_paths)}
                        alt={`${variantLabel} fine jewelry piece`}
                        fill
                        className="object-contain object-center group-hover/link:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        priority={index < 10}
                    />
                </div>

                <div className="px-5 pt-3">
                    <h3 className="text-sm font-semibold text-slate-900 line-clamp-2 min-h-[40px] group-hover/link:text-slate-700 transition-colors text-left">
                        {group.displayName}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1" aria-live="polite">
                        {displayColor}
                    </p>
                </div>
            </Link>

            <div className="px-5 mt-3">
                <div className="flex flex-wrap gap-2 pb-1" aria-label={`${group.displayName} color variants`}>
                    {uniqueSwatchVariants.map(({ variant, isAvailable }) => {
                        const isActive = getVariantSwatchKey(variant) === getVariantSwatchKey(activeVariant)
                        return (
                            <button
                                key={variant.id}
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault() // prevent navigating if button click propagates
                                    setActiveVariant(variant)
                                }}
                                onMouseEnter={() => {
                                    if (supportsHover) setHoverVariant(variant)
                                }}
                                onMouseLeave={() => {
                                    if (supportsHover) setHoverVariant(null)
                                }}
                                aria-label={`Select ${variant.color?.trim() || variant.name} variant`}
                                aria-pressed={isActive}
                                className={cn(
                                    "w-5 h-5 rounded-full border border-gray-200 cursor-pointer flex-shrink-0 transition-all focus:outline-none",
                                    "focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2",
                                    isActive && "ring-1 ring-offset-1 ring-slate-900 border-transparent",
                                    !isActive && !isAvailable && "opacity-20 relative overflow-hidden after:absolute after:inset-0 after:block after:h-[1px] after:w-[150%] after:bg-slate-500 after:-rotate-45 after:top-1/2 after:-left-1/4 hover:opacity-50",
                                    !isActive && isAvailable && "hover:scale-110"
                                )}
                                style={resolveSwatchStyle(variant)}
                            />
                        )
                    })}
                </div>
            </div>

            <div className="px-5 pb-5 pt-3 mt-auto transition-colors hover:bg-slate-50/80 group/action">
                <p className="text-[11px] text-slate-700 truncate uppercase tracking-widest mb-2">
                    {group.category}
                </p>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0" aria-label={pricingAriaLabel}>
                        {tieredPricing.usesPercentageFallback ? (
                            <p className="text-xs text-slate-500">Price unavailable</p>
                        ) : (
                            <div className="flex flex-col">
                                <span className="text-base font-semibold text-slate-900">
                                    £{tieredPricing.selectedEstimate !== null
                                        ? tieredPricing.selectedEstimate
                                        : tieredPricing.week1Amount}
                                </span>
                                <span className="text-xs text-slate-500">
                                    {tieredPricing.selectedEstimate !== null
                                        ? `${rentalDays} days rental${tieredPricing.isMonthlyBridge ? " (Monthly rate)" : ""}`
                                        : "1 week rental"}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex-shrink-0">
                        {committedDate ? (
                            isSelected ? (
                                <Button
                                    type="button"
                                    aria-pressed={isSelected}
                                    aria-label={`Remove ${variantLabel} from request`}
                                    className="h-11 w-11 min-w-[44px] rounded-md bg-white border border-green-300 text-green-700 hover:text-green-800 hover:border-green-400 hover:bg-green-50 p-0 flex items-center justify-center transition-all group-hover/action:scale-105"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        removeItem(activeVariant.id)
                                        toast("Item removed from request", {
                                            action: {
                                                label: "Undo",
                                                onClick: () => addItem({
                                                    id: activeVariant.id,
                                                    name: activeVariant.name,
                                                    category: activeVariant.category,
                                                    rental_price: activeVariant.rental_price,
                                                    replacement_cost: activeVariant.replacement_cost,
                                                    image_paths: activeVariant.image_paths,
                                                    status: activeVariant.status,
                                                }),
                                            },
                                        })
                                    }}
                                >
                                    <Check className="h-5 w-5" aria-hidden="true" />
                                    <span className="sr-only">Remove from request</span>
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    aria-pressed={false}
                                    aria-label={`Add ${variantLabel} to request`}
                                    className="h-11 min-w-[44px] rounded-md bg-slate-900 text-white hover:bg-slate-800 group-hover/action:scale-105 text-xs font-semibold px-6 transition-transform"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        addItem({
                                            id: activeVariant.id,
                                            name: activeVariant.name,
                                            category: activeVariant.category,
                                            rental_price: activeVariant.rental_price,
                                            replacement_cost: activeVariant.replacement_cost,
                                            image_paths: activeVariant.image_paths,
                                            status: activeVariant.status,
                                        })
                                        toast.success(`Added ${variantLabel} to request`)
                                    }}
                                >
                                    + Add
                                </Button>
                            )
                        ) : (
                            <Button
                                type="button"
                                aria-disabled="true"
                                aria-label="Rental dates must be selected first"
                                className="h-11 min-w-[44px] rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold px-6 cursor-not-allowed opacity-50"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    triggerDateError()
                                }}
                            >
                                + Add
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    )
}
