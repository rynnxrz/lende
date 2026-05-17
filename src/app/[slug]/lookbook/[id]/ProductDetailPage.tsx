'use client'

import { ChevronLeft } from 'lucide-react'

import { useLookbookCart, type LookbookCartItem } from '@/store/lookbook-cart'
import type { LookbookItemRow } from './LookbookViewer'

type Props = {
    item: LookbookItemRow
    onBack: () => void
    isMobile: boolean
}

const HIDDEN_SPEC_KEYS = new Set(['page_numbers', 'pageNumbers', 'material', 'color', 'colour', 'weight'])

export function ProductDetailPage({ item, onBack, isMobile }: Props) {
    const cart = useLookbookCart()
    const detail = item.item
    if (!detail) return null

    const inCart = cart.hasItem(item.inventory_item_id ?? detail.id)

    const handleAdd = () => {
        const cartItem: LookbookCartItem = {
            id: item.inventory_item_id ?? detail.id,
            inventoryItemId: detail.id,
            name: detail.name ?? 'Item',
            sku: detail.sku,
            rentalPrice:
                typeof detail.rental_price === 'number'
                    ? detail.rental_price
                    : detail.rental_price != null
                      ? parseFloat(String(detail.rental_price))
                      : null,
            image: detail.images?.[0] ?? null,
        }
        cart.addItem(cartItem)
    }

    const heroImage = detail.images?.[0] ?? null
    const price = detail.replacement_cost ?? detail.rental_price
    const priceNum = price != null && price !== '' ? Number(price) : null
    const priceText = priceNum != null && !isNaN(priceNum) ? `£${priceNum.toFixed(2)}` : null

    // Collect specs from top-level columns + JSONB
    const specs: { label: string; value: string }[] = []
    if (detail.material) specs.push({ label: 'Material', value: detail.material })
    if (detail.color) specs.push({ label: 'Colour', value: detail.color })
    if (detail.weight) specs.push({ label: 'Weight', value: detail.weight })
    if (detail.specs && typeof detail.specs === 'object') {
        for (const [key, rawValue] of Object.entries(detail.specs)) {
            if (HIDDEN_SPEC_KEYS.has(key)) continue
            if (rawValue == null || rawValue === '') continue
            if (typeof rawValue === 'object') continue
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
            specs.push({ label, value: String(rawValue) })
        }
    }

    // Always use the portrait single-column layout so the detail view sits
    // inside the same portrait page container as the flipbook. (isMobile is
    // kept in the Props for backward-compatibility but no longer branches.)
    return (
        <div className="flex h-full flex-col bg-white text-slate-900">
                {/* Back button */}
                <div className="flex items-center px-3 py-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                        <ChevronLeft className="size-4" />
                        <span>Back</span>
                    </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Hero image */}
                    <div className="aspect-square w-full bg-slate-100">
                        {heroImage ? (
                            <img
                                src={heroImage}
                                alt={detail.name ?? 'Product'}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-slate-400">
                                No image
                            </div>
                        )}
                    </div>

                    {/* Details */}
                    <div className="space-y-4 px-5 py-5">
                        {detail.category && (
                            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
                                {detail.category}
                            </p>
                        )}
                        <h2 className="text-xl font-semibold leading-tight">
                            {detail.name ?? 'Item'}
                        </h2>
                        {detail.sku && (
                            <p className="font-mono text-xs text-slate-500">{detail.sku}</p>
                        )}
                        {priceText && (
                            <p className="text-lg font-semibold tabular-nums">{priceText}</p>
                        )}
                        {detail.description && (
                            <p className="text-sm leading-relaxed text-slate-600">
                                {detail.description}
                            </p>
                        )}

                        {/* Specs grid */}
                        {specs.length > 0 && (
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-slate-100 pt-4">
                                {specs.map((s) => (
                                    <div key={s.label} className="contents">
                                        <dt className="text-xs font-medium text-slate-400">
                                            {s.label}
                                        </dt>
                                        <dd className="text-sm text-slate-700">{s.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </div>
                </div>

                {/* Sticky CTA */}
                <div className="border-t border-slate-100 px-5 py-3">
                    {inCart ? (
                        <p className="py-2 text-center text-sm font-medium text-emerald-700">
                            Added to request
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                            Add to Request
                        </button>
                    )}
                </div>
            </div>
        )
}
