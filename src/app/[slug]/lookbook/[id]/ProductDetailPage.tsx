'use client'

import { ChevronLeft } from 'lucide-react'

import { ProductImage } from '@/components/catalog/ProductImage'
import { useLookbookCart, type LookbookCartItem } from '@/store/lookbook-cart'
import type { LookbookItemRow } from './LookbookViewer'

type Props = {
    item: LookbookItemRow
    onBack: () => void
    orgSlug: string
}

const HIDDEN_SPEC_KEYS = new Set(['page_numbers', 'pageNumbers', 'material', 'color', 'colour', 'weight'])

export function ProductDetailPage({ item, onBack, orgSlug }: Props) {
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
    const catalogHref = `/${orgSlug}/catalog/${item.inventory_item_id ?? detail.id}`

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

    // Portrait single-column layout keeps the detail view inside the same page
    // shape as the flipbook.
    return (
        <div className="flex h-full flex-col bg-[#f7f5f0] text-[#161513]">
            {/* Back button */}
            <div className="flex items-center px-4 py-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1 px-2 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[#161513]/55 transition-colors duration-300 hover:text-[#161513] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161513]/30"
                >
                    <ChevronLeft className="size-4" />
                    <span>Back</span>
                </button>
            </div>

            {/* Content — centered as one unit so it doesn't leave a dead
                    gap above the CTA when there's little text; scrolls if
                    the content ever exceeds the panel height. */}
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-7 py-4">
                {/* Hero image — uncropped on the paper; the product carries the
                    view, no frame competes with it */}
                <ProductImage
                    src={heroImage}
                    alt={detail.name ?? 'Product'}
                    className="h-52 w-full max-w-[280px] shrink-0"
                    priority
                />

                {/* Details */}
                <div className="mt-6 w-full max-w-xs space-y-2.5 text-center">
                    {detail.category && (
                        <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[#8a857b]">
                            {detail.category}
                        </p>
                    )}
                    <h2 className="text-2xl font-light leading-tight tracking-[0.04em]">
                        {detail.name ?? 'Item'}
                    </h2>
                    {detail.sku && (
                        <p className="font-mono text-[11px] text-[#161513]/45">{detail.sku}</p>
                    )}
                    {priceText && (
                        <p className="text-sm tracking-[0.18em] tabular-nums text-[#161513]">{priceText}</p>
                    )}
                    {detail.description && (
                        <p className="text-sm leading-relaxed text-[#161513]/70">
                            {detail.description}
                        </p>
                    )}
                </div>

                {/* Specs grid */}
                {specs.length > 0 && (
                    <dl className="mt-5 grid w-full max-w-xs grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-[#161513]/10 pt-4 text-left">
                        {specs.map((s) => (
                            <div key={s.label} className="contents">
                                <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#8a857b]">
                                    {s.label}
                                </dt>
                                <dd className="text-sm text-[#161513]/85">{s.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>

            {/* Sticky CTA */}
            <div className="border-t border-[#161513]/10 px-5 py-3">
                <a
                    href={catalogHref}
                    className="mb-2 block w-full border border-[#161513]/25 px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-[#161513] transition-colors duration-300 hover:bg-[#161513] hover:text-[#f7f5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161513]/40"
                >
                    View & Reserve
                </a>
                {inCart ? (
                    <p className="py-2 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-[#161513]/60">
                        Added to request
                    </p>
                ) : (
                    <button
                        type="button"
                        onClick={handleAdd}
                        className="w-full bg-[#161513] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#f7f5f0] transition-colors duration-300 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#161513]/40"
                    >
                        Add to Request
                    </button>
                )}
            </div>
        </div>
    )
}
