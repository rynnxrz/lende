"use client"

import * as React from "react"
import Link from 'next/link'
import Image from 'next/image'
import { CustomerServiceWidget } from "@/components/customer-service/CustomerServiceWidget"
import { BookingForm } from './BookingForm'
import { ArrowLeft } from 'lucide-react'
import { cn } from "@/lib/utils"
import { useRequestStore } from "@/store/request"
import { normalizeBillableDays } from "@/lib/invoice/pricing"
import {
    buildTieredPricingDisplay,
    formatTierAmount,
} from "@/lib/invoice/tiered-display"
import {
    buildUniqueSwatchVariants,
    getVariantSize,
    getVariantSwatchKey,
    normalizeValue,
    resolveSwatchStyle,
    type CatalogVariant,
} from "@/components/catalog/ProductGroupCard"

// Define the shape of the Item similar to what page.tsx uses, or import types if available.
// For now inline to match page.tsx structure.
interface Item {
    id: string
    name: string
    category: string
    color?: string | null
    rental_price: number
    replacement_cost?: number | null
    description: string | null
    specs: Record<string, unknown> | null
    image_paths: string[] | null
    sku: string | null
    status: string
    material?: string | null
    weight?: string | null
}

interface ItemDetailClientProps {
    item: Item
    variants?: Item[]
    context?: string
    relatedItemsSlot?: React.ReactNode
    orgSlug: string
}



function findBestVariantMatch(
    variants: Item[],
    currentItem: Item,
    input: {
        targetSwatchKey?: string
        targetSizeKey?: string
        preferredDimension: "color" | "size"
    }
): Item {
    const matchesColor = (variant: Item) => (
        !input.targetSwatchKey ||
        getVariantSwatchKey(variant as unknown as CatalogVariant) === input.targetSwatchKey
    )

    const matchesSize = (variant: Item) => (
        !input.targetSizeKey ||
        normalizeValue(getVariantSize(variant) || "") === input.targetSizeKey
    )

    const fullyMatched = variants.find((variant) => matchesColor(variant) && matchesSize(variant))
    if (fullyMatched) return fullyMatched

    if (input.preferredDimension === "color" && input.targetSwatchKey) {
        const colorMatched = variants.find((variant) => matchesColor(variant))
        if (colorMatched) return colorMatched
    }

    if (input.preferredDimension === "size" && input.targetSizeKey) {
        const sizeMatched = variants.find((variant) => matchesSize(variant))
        if (sizeMatched) return sizeMatched
    }

    return currentItem
}

export function ItemDetailClient({ item: initialItem, variants = [], context, relatedItemsSlot, orgSlug }: ItemDetailClientProps) {
    const isArchiveMode = context === 'archive'
    const { dateRange } = useRequestStore()

    const [activeItemId, setActiveItemId] = React.useState(initialItem.id)
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null)
    const [unselectedSwatch, setUnselectedSwatch] = React.useState(false)
    const [unselectedSize, setUnselectedSize] = React.useState(false)

    const normalizedVariants = React.useMemo(() => {
        if (variants.length > 0) return variants
        return [initialItem]
    }, [variants, initialItem])

    // Reset state when server-provided item changes
    React.useEffect(() => {
        setActiveItemId(initialItem.id)
        setSelectedImage(null)
        setUnselectedSwatch(false)
        setUnselectedSize(false)
    }, [initialItem.id])

    // Derive active item from variants or fallback to initialItem
    const item = React.useMemo(() => {
        return normalizedVariants.find(v => v.id === activeItemId) || initialItem;
    }, [activeItemId, normalizedVariants, initialItem])

    // Find if the currently selected image is still valid in the new item, if not reset
    React.useEffect(() => {
        if (selectedImage && !item.image_paths?.includes(selectedImage)) {
            setSelectedImage(null)
        }
    }, [item.image_paths, selectedImage])

    const handleVariantChange = (variantId: string) => {
        setActiveItemId(variantId)
        setSelectedImage(null)
        
        // Shallow update URL without triggering Next.js suspense/loading boundary
        const url = new URL(window.location.href);
        url.pathname = `/catalog/${variantId}`;
        window.history.replaceState(null, '', url.pathname + url.search);
    }

    const activeSwatchKey = React.useMemo(() => {
        if (unselectedSwatch) return null
        return getVariantSwatchKey(item as unknown as CatalogVariant)
    }, [item, unselectedSwatch])

    const activeSizeKey = React.useMemo(() => {
        if (unselectedSize) return null
        return normalizeValue(getVariantSize(item) || "")
    }, [item, unselectedSize])
    const colorOptions = React.useMemo(() => {
        const uniqueData = buildUniqueSwatchVariants(
            normalizedVariants as unknown as CatalogVariant[],
            item.id,
            activeSizeKey
        )

        return uniqueData.map(({ variant, isAvailable }) => ({
            variant,
            swatchKey: getVariantSwatchKey(variant as unknown as CatalogVariant),
            isAvailableWithCurrentSize: isAvailable
        }))
    }, [normalizedVariants, item.id, activeSizeKey])
    const sizeOptions = React.useMemo(() => {
        const buckets = new Map<string, Item[]>()

        for (const variant of normalizedVariants) {
            const sizeValue = getVariantSize(variant)
            if (!sizeValue) continue

            const sizeKey = normalizeValue(sizeValue)
            const existing = buckets.get(sizeKey)
            if (existing) {
                existing.push(variant)
                continue
            }
            buckets.set(sizeKey, [variant])
        }

        return Array.from(buckets.entries()).map(([sizeKey, bucket]) => {
            const isAvailableWithCurrentColor = activeSwatchKey ? normalizedVariants.some(v => 
                normalizeValue(getVariantSize(v) || "") === sizeKey &&
                getVariantSwatchKey(v as unknown as CatalogVariant) === activeSwatchKey
            ) : true
            
            return {
                sizeKey,
                label: getVariantSize(bucket[0]) || "",
                representative: bucket.find((variant) => variant.id === item.id) || bucket[0],
                isAvailableWithCurrentColor
            }
        }).sort((a, b) => {
            // Sort available first
            if (a.isAvailableWithCurrentColor && !b.isAvailableWithCurrentColor) return -1
            if (!a.isAvailableWithCurrentColor && b.isAvailableWithCurrentColor) return 1
            return 0
        })
    }, [normalizedVariants, item.id, activeSwatchKey])

    const handleColorChange = (swatchKey: string) => {
        if (swatchKey === activeSwatchKey) {
            setUnselectedSwatch(true)
            return
        }

        const nextVariant = findBestVariantMatch(normalizedVariants, item, {
            targetSwatchKey: swatchKey,
            targetSizeKey: activeSizeKey || undefined,
            preferredDimension: "color",
        })

        setUnselectedSwatch(false)
        
        const nextSizeKey = normalizeValue(getVariantSize(nextVariant) || "")
        if (activeSizeKey && nextSizeKey !== activeSizeKey) {
            setUnselectedSize(true)
        }

        handleVariantChange(nextVariant.id)
    }

    const handleSizeChange = (sizeKey: string) => {
        if (sizeKey === activeSizeKey) {
            setUnselectedSize(true)
            return
        }

        const nextVariant = findBestVariantMatch(normalizedVariants, item, {
            targetSwatchKey: activeSwatchKey || undefined,
            targetSizeKey: sizeKey,
            preferredDimension: "size",
        })

        setUnselectedSize(false)

        const nextColorKey = getVariantSwatchKey(nextVariant as unknown as CatalogVariant)
        if (activeSwatchKey && nextColorKey !== activeSwatchKey) {
            setUnselectedSwatch(true)
        }

        handleVariantChange(nextVariant.id)
    }

    const getImageUrl = (images: string[] | null) => {
        if (images && images.length > 0) return images[0]
        return 'https://placehold.co/800x600.png?text=No+Image'
    }

    const currentImage = selectedImage || getImageUrl(item.image_paths)
    const displayName = item.color ? `${item.color} ${item.name}` : item.name
    const selectedRentalDays = React.useMemo(() => {
        if (!dateRange.from || !dateRange.to) return null

        const fromDate = new Date(dateRange.from)
        const toDate = new Date(dateRange.to)
        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return null

        return normalizeBillableDays(
            Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        )
    }, [dateRange.from, dateRange.to])
    const tieredPricing = buildTieredPricingDisplay({
        replacementCost: item.replacement_cost,
        selectedDays: selectedRentalDays,
    })

    const specs = (item.specs as Record<string, string>) || {}

    const colorLabel = activeSwatchKey 
        ? (item.color ? item.color.toUpperCase() : 'DEFAULT') 
        : 'PLEASE SELECT'

    const sizeLabel = activeSizeKey
        ? (getVariantSize(item) || "-")
        : 'PLEASE SELECT'

    const isReadyToBook = (!sizeOptions.length || activeSizeKey) && activeSwatchKey

    // Smart Back Button Logic
    const backHref = isArchiveMode ? `/${orgSlug}/archive` : `/${orgSlug}/catalog`
    const backLabel = isArchiveMode ? 'Back to Archive' : 'Back to Collection'

    return (
        <main id="main-content" tabIndex={-1} className="min-h-screen bg-white pb-20" aria-label={`${displayName} details`}>
            {/* Breadcrumb / Back */}
            <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-6">
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 transition-colors py-2 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none rounded-md"
                    aria-label={backLabel}
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    {backLabel}
                </Link>
            </div>

            <section className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-32 md:pb-0" aria-label="Jewelry details">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-24">

                    {/* Image Side */}
                    <div className="lg:sticky lg:top-24">
                        <div className="relative bg-white w-full h-[40vh] lg:h-auto lg:aspect-square overflow-hidden rounded-md mb-4">
                            <Image
                                src={currentImage}
                                alt={`${displayName} fine jewelry piece`}
                                fill
                                className="object-contain object-center p-8 transition-opacity duration-300"
                                priority
                                sizes="(max-width: 1024px) 100vw, 50vw"
                            />
                        </div>

                        {/* Thumbnails */}
                        {item.image_paths && item.image_paths.length > 1 && (
                            <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                                {item.image_paths.map((path, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setSelectedImage(path)}
                                        aria-label={`View image ${idx + 1} of ${displayName}`}
                                        aria-pressed={selectedImage === path || (!selectedImage && idx === 0)}
                                        className={cn(
                                            "relative w-16 h-16 flex-shrink-0 bg-white rounded-md overflow-hidden border-2 transition-all focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none",
                                            (selectedImage === path || (!selectedImage && idx === 0))
                                                ? "border-slate-900 ring-1 ring-slate-900"
                                                : "border-transparent hover:border-slate-300"
                                        )}
                                    >
                                        <Image
                                            src={path}
                                            alt={`Thumbnail ${idx + 1} of ${displayName}`}
                                            fill
                                            className="object-cover object-center"
                                            sizes="64px"
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Content Side */}
                    <div className="lg:mt-8">
                        <div className="mb-2">
                            <span className="text-xs font-semibold tracking-widest text-slate-700 uppercase">
                                {item.category}
                            </span>
                        </div>

                        <h1 className="text-3xl md:text-4xl font-light text-slate-900 mb-2 tracking-tight">
                            {item.name}
                        </h1>

                        {item.description && (
                            <h2 className="text-lg text-slate-600 mb-6 font-medium">
                                {item.description}
                            </h2>
                        )}

                        <div className="mb-8 border-b border-gray-100 pb-8">
                            {!isArchiveMode && (
                                <div className="flex flex-col">
                                    <div className="text-3xl font-medium text-gray-900">
                                        {formatTierAmount(tieredPricing.selectedEstimate ?? tieredPricing.week1Amount, 15)}
                                    </div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {selectedRentalDays !== null 
                                            ? `${selectedRentalDays} days rental` 
                                            : "Starts from 1 week rental"}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Area (Booking Form) - Moved Up, Only show if NOT in archive mode */}
                        {!isArchiveMode && (
                            <div className="mb-4">
                                {!isReadyToBook && (
                                    <p className="text-xs text-red-500 font-medium mb-2 uppercase tracking-wide">
                                        Please select a {!activeSwatchKey ? "Color" : ""}{!activeSwatchKey && (!activeSizeKey && sizeOptions.length > 0) ? " and " : ""}{!activeSizeKey && sizeOptions.length > 0 ? "Size" : ""}
                                    </p>
                                )}
                                <div className={cn("transition-opacity duration-300", !isReadyToBook && "opacity-50 pointer-events-none")}>
                                    <BookingForm item={item} orgSlug={orgSlug} />
                                </div>
                            </div>
                        )}

                        {/* Variants Selector */}
                        {normalizedVariants.length > 1 && (
                            <div className="border-t border-gray-100 pt-6 pb-2 mt-6">
                                <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-4 flex items-center">
                                    <span className="text-slate-900">COLOR: <span className={cn("font-normal ml-1", !activeSwatchKey ? "text-red-500" : "text-slate-500")}>{colorLabel}</span></span>
                                </h3>
                                <div className="flex flex-wrap gap-3 pb-4" aria-label={`${item.name} color variants`}>
                                    {colorOptions.map(({ variant, swatchKey, isAvailableWithCurrentSize }) => {
                                        const isActive = swatchKey === activeSwatchKey
                                        return (
                                            <button
                                                key={variant.id}
                                                type="button"
                                                onClick={() => handleColorChange(swatchKey)}
                                                aria-label={`Select ${variant.color?.trim() || variant.name} variant`}
                                                aria-pressed={isActive}
                                                className={cn(
                                                    "w-8 h-8 rounded-full border border-gray-200 cursor-pointer flex-shrink-0 transition-all",
                                                    "focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none",
                                                    isActive && "ring-2 ring-offset-2 ring-slate-900 border-transparent",
                                                    !isActive && "hover:scale-110",
                                                    !isAvailableWithCurrentSize && "opacity-20 relative overflow-hidden after:absolute after:inset-0 after:block after:h-[2px] after:w-[150%] after:bg-slate-600 after:-rotate-45 after:top-1/2 after:-left-1/4 hover:opacity-50"
                                                )}
                                                style={resolveSwatchStyle(variant as unknown as CatalogVariant)}
                                            />
                                        )
                                    })}
                                </div>

                                {sizeOptions.length > 0 && (
                                    <>
                                        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-4 mt-2 flex items-center">
                                            <span className="text-slate-900">SIZE: <span className={cn("font-normal ml-1", !activeSizeKey ? "text-red-500" : "text-slate-500")}>{sizeLabel}</span></span>
                                        </h3>
                                        <div className="flex flex-wrap gap-2 pb-4" aria-label={`${item.name} size variants`}>
                                            {sizeOptions.map((sizeOption) => {
                                                const isActive = sizeOption.sizeKey === activeSizeKey
                                                return (
                                                    <button
                                                        key={`${sizeOption.sizeKey}-${sizeOption.representative.id}`}
                                                        type="button"
                                                        onClick={() => handleSizeChange(sizeOption.sizeKey)}
                                                        aria-label={`Select ${sizeOption.label} size`}
                                                        aria-pressed={isActive}
                                                        className={cn(
                                                            "h-8 min-w-10 px-3 rounded border text-xs font-medium transition-all",
                                                            "focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none",
                                                            isActive
                                                                ? "border-slate-900 bg-slate-900 text-white"
                                                                : "border-slate-300 text-slate-700 hover:border-slate-900 hover:text-slate-900",
                                                            !sizeOption.isAvailableWithCurrentColor && "opacity-20 relative overflow-hidden after:absolute after:inset-0 after:block after:h-[1.5px] after:w-[150%] after:bg-slate-600 after:-rotate-45 after:top-1/2 after:-left-1/4 hover:opacity-50"
                                                        )}
                                                    >
                                                        {sizeOption.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Description Moved to Top */}

                        {/* Specifications - More Compact */}
                        <div className="border-t border-gray-100 pt-6">
                            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-4">
                                Specifications
                            </h3>
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                {item.color && (
                                    <div className="flex flex-col gap-1">
                                        <dt className="text-slate-500">Color</dt>
                                        <dd className="text-slate-900">{item.color}</dd>
                                    </div>
                                )}
                                <div className="flex flex-col gap-1">
                                    <dt className="text-slate-500">SKU</dt>
                                    <dd className="text-slate-900">{item.sku}</dd>
                                </div>
                                {!isArchiveMode && (
                                    <div className="flex flex-col gap-1">
                                        <dt className="text-slate-500">Replacement Value</dt>
                                        <dd className="text-slate-900">
                                            {Number(item.replacement_cost) > 0
                                                ? `£${Number(item.replacement_cost)}`
                                                : 'RRP missing'}
                                        </dd>
                                    </div>
                                )}
                                {item.material && (
                                    <div className="flex flex-col gap-1">
                                        <dt className="text-slate-500">Material</dt>
                                        <dd className="text-slate-900">{item.material}</dd>
                                    </div>
                                )}
                                {item.weight && (
                                    <div className="flex flex-col gap-1">
                                        <dt className="text-slate-500">Weight</dt>
                                        <dd className="text-slate-900">
                                            {item.weight.replace(/\s*g\s*\/per\s*piece/i, 'g per piece').replace(/\s*g\s*\/\s*piece/i, 'g per piece')}
                                        </dd>
                                    </div>
                                )}
                                {Object.entries(specs).map(([key, value]) => {
                                    const displayKey = key.toLowerCase() === 'size' ? 'Size' : key;
                                    return (
                                        <div key={key} className="flex flex-col gap-1">
                                            <dt className="text-slate-500">{displayKey}</dt>
                                            <dd className="text-slate-900">{value as string}</dd>
                                        </div>
                                    )
                                })}
                            </dl>
                        </div>

                    </div>
                </div>

                {/* Related Items Section - Injected via Slot */}
                {relatedItemsSlot}
            </section>
            {!isArchiveMode && (
                <CustomerServiceWidget
                    storageKey={`customer-service:item:${item.id}`}
                    baseContext={{
                        pageType: 'catalog_item',
                        path: `/${orgSlug}/catalog/${item.id}`,
                        orgSlug,
                        item: {
                            id: item.id,
                            name: item.name,
                            category: item.category,
                            rentalPrice: item.rental_price,
                            replacementCost: item.replacement_cost,
                            material: item.material ?? null,
                            weight: item.weight ?? null,
                            color: item.color ?? null,
                            sku: item.sku ?? null,
                            description: item.description ?? null,
                            specs: Object.fromEntries(
                                Object.entries(item.specs || {}).flatMap(([key, value]) => (
                                    typeof value === 'string' || typeof value === 'number'
                                        ? [[key, String(value)]]
                                        : []
                                ))
                            ),
                        },
                    }}
                />
            )}
        </main>
    )
}
