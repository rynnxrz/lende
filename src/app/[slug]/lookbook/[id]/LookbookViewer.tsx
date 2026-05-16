'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react'
import HTMLFlipBook from 'react-pageflip'

import { useIsMobile } from '@/hooks/useIsMobile'
import { useLookbookCart } from '@/store/lookbook-cart'
import type { LookbookCartItem } from '@/store/lookbook-cart'
import { LookbookCartDrawer } from './LookbookCartDrawer'
import { ProductDetailPage } from './ProductDetailPage'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LookbookItemRow = {
    id: string
    page_number: number
    bbox_x: number
    bbox_y: number
    bbox_w: number
    bbox_h: number
    inventory_item_id: string | null
    item: {
        id: string
        sku: string | null
        name: string | null
        rental_price: number | string | null
        replacement_cost: number | string | null
        images: string[] | null
        description: string | null
        category: string | null
        material: string | null
        color: string | null
        weight: string | null
        specs: Record<string, unknown> | null
    } | null
}

type Props = {
    orgName: string
    organizationId: string
    lookbookId: string
    lookbookTitle: string
    pageCount: number
    pdfSignedUrl: string
    items: LookbookItemRow[]
}

type RenderedPage = {
    pageNumber: number
    canvas: HTMLCanvasElement
}

// ---------------------------------------------------------------------------
// FlipPage — forwardRef wrapper required by react-pageflip
// ---------------------------------------------------------------------------

const FlipPage = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
    function FlipPage(props, ref) {
        return (
            <div ref={ref} className="h-full w-full">
                {props.children}
            </div>
        )
    },
)

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LookbookViewer({
    orgName,
    organizationId,
    lookbookId,
    lookbookTitle,
    pageCount,
    pdfSignedUrl,
    items,
}: Props) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flipBookRef = useRef<any>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [cartOpen, setCartOpen] = useState(false)
    const [pulsed, setPulsed] = useState(false)
    const [currentPage, setCurrentPage] = useState(0)
    const [showProduct, setShowProduct] = useState<LookbookItemRow | null>(null)
    const [containerSize, setContainerSize] = useState({ width: 600, height: 800 })
    const [flipKey, setFlipKey] = useState(0)

    const isMobile = useIsMobile()
    const cart = useLookbookCart()

    const totalPages = pageCount > 0 ? pageCount : renderedPages.length

    const itemsByPage = useMemo(() => {
        const map = new Map<number, LookbookItemRow[]>()
        for (const it of items) {
            const list = map.get(it.page_number) ?? []
            list.push(it)
            map.set(it.page_number, list)
        }
        return map
    }, [items])

    // Measure viewport for flip book dimensions (height-driven, with width fallback)
    useEffect(() => {
        if (typeof window === 'undefined') return

        const measure = () => {
            const padding = 32 // 16px on each side
            const viewportW = window.innerWidth - padding
            const viewportH = window.innerHeight - padding
            const aspectRatio = isMobile ? 3 / 4 : 3 / 2

            let h = viewportH
            let w = h * aspectRatio
            if (w > viewportW) {
                w = viewportW
                h = w / aspectRatio
            }

            const wRounded = Math.round(w)
            const hRounded = Math.round(h)
            setContainerSize(prev => {
                if (wRounded === prev.width && hRounded === prev.height) return prev
                setFlipKey(k => k + 1)
                return { width: wRounded, height: hRounded }
            })
        }

        measure()
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [isMobile])

    // PDF rendering
    useEffect(() => {
        let cancelled = false
        async function renderPdf() {
            try {
                const pdfjs = await import('pdfjs-dist')
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
                const loadingTask = pdfjs.getDocument({ url: pdfSignedUrl })
                const pdf = await loadingTask.promise
                if (cancelled) return

                const scale = 1.5
                const total = pageCount > 0 ? pageCount : pdf.numPages

                const out: RenderedPage[] = []
                for (let n = 1; n <= total; n += 1) {
                    if (cancelled) return
                    const page = await pdf.getPage(n)
                    const viewport = page.getViewport({ scale })
                    const canvas = document.createElement('canvas')
                    canvas.width = viewport.width
                    canvas.height = viewport.height
                    const ctx = canvas.getContext('2d')
                    if (!ctx) throw new Error('could not get 2d context')
                    await page.render({ canvasContext: ctx, viewport, canvas }).promise
                    out.push({ pageNumber: n, canvas })
                    if (n === 1) {
                        setRenderedPages([...out])
                        setLoading(false)
                    }
                }
                if (!cancelled) setRenderedPages(out)
            } catch (err) {
                if (!cancelled) {
                    console.error('[LookbookViewer] render failed', err)
                    setError(err instanceof Error ? err.message : 'render failed')
                    setLoading(false)
                }
            }
        }
        void renderPdf()
        return () => { cancelled = true }
    }, [pdfSignedUrl, pageCount])

    // First-visit pulse
    useEffect(() => {
        if (typeof window === 'undefined') return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        setPulsed(true)
        const t = setTimeout(() => setPulsed(false), 3000)
        return () => clearTimeout(t)
    }, [])

    // Navigation
    const flipNext = useCallback(() => {
        flipBookRef.current?.pageFlip()?.flipNext()
    }, [])

    const flipPrev = useCallback(() => {
        flipBookRef.current?.pageFlip()?.flipPrev()
    }, [])

    const goBackFromProduct = useCallback(() => {
        setShowProduct(null)
    }, [])

    const handleItemClick = useCallback((item: LookbookItemRow) => {
        if (!item.item) return
        setShowProduct(item)
    }, [])

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showProduct) {
                e.preventDefault()
                goBackFromProduct()
                return
            }
            if (showProduct) return
            if (e.key === 'ArrowRight') {
                e.preventDefault()
                flipNext()
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                flipPrev()
            }
        }
        document.addEventListener('keydown', handleKey)
        return () => document.removeEventListener('keydown', handleKey)
    }, [showProduct, flipNext, flipPrev, goBackFromProduct])

    const isFirstPage = currentPage === 0
    const isLastPage = currentPage >= totalPages - 1

    // Product detail overlay
    if (showProduct) {
        return (
            <div className="relative">
                <header className="mb-4 flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-xs uppercase tracking-widest text-slate-500">
                            {orgName}
                        </p>
                        <h1 className="truncate text-lg font-semibold">{lookbookTitle}</h1>
                    </div>
                </header>
                <div
                    className="overflow-hidden rounded-lg bg-white"
                    style={{ aspectRatio: isMobile ? '3 / 4' : '3 / 2' }}
                >
                    <ProductDetailPage
                        item={showProduct}
                        onBack={goBackFromProduct}
                        isMobile={isMobile}
                    />
                </div>
                <LookbookCartDrawer
                    open={cartOpen}
                    onOpenChange={setCartOpen}
                    organizationId={organizationId}
                    lookbookId={lookbookId}
                />
            </div>
        )
    }

    return (
        <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-950">
            {/* Floating top-left: org + title */}
            <div className="pointer-events-none absolute left-4 top-4 z-30 max-w-[40%] rounded-md bg-slate-900/50 px-3 py-2 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-widest text-white/50">
                    {orgName}
                </p>
                <h1 className="truncate text-sm font-medium text-white/90">
                    {lookbookTitle}
                </h1>
            </div>

            {/* Floating top-right: cart button */}
            {cart.items.length > 0 && (
                <button
                    type="button"
                    onClick={() => setCartOpen(true)}
                    className="absolute right-4 top-4 z-30 rounded-full bg-slate-900/50 p-2.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-slate-900/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    aria-label={`Cart, ${cart.items.length} items`}
                >
                    <ShoppingBag className="size-5" />
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold tabular-nums text-white">
                        {cart.items.length}
                    </span>
                </button>
            )}

            {/* Book frame - viewport-centered, JS-sized in px */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div
                    ref={containerRef}
                    className="relative overflow-hidden rounded-lg bg-slate-900"
                    style={{
                        width: `${containerSize.width}px`,
                        height: `${containerSize.height}px`,
                    }}
                >
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-white" />
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-center text-rose-300">
                                Failed to load lookbook ({error})
                            </p>
                        </div>
                    )}

                    {!loading && !error && renderedPages.length > 0 && (
                        /* @ts-expect-error react-pageflip types are incomplete */
                        <HTMLFlipBook
                            key={flipKey}
                            ref={flipBookRef}
                            width={isMobile ? containerSize.width : Math.round(containerSize.width / 2)}
                            height={containerSize.height}
                            size="stretch"
                            minWidth={280}
                            maxWidth={1200}
                            minHeight={370}
                            maxHeight={1600}
                            drawShadow={true}
                            flippingTime={800}
                            usePortrait={isMobile}
                            maxShadowOpacity={0.5}
                            showCover={!isMobile}
                            mobileScrollSupport={true}
                            onFlip={(e: { data: number }) => setCurrentPage(e.data)}
                            className="book-shadow"
                            startPage={0}
                            clickEventForward={true}
                            swipeDistance={30}
                        >
                            {renderedPages.map((rp) => (
                                <FlipPage key={rp.pageNumber}>
                                    <PageWithHotZones
                                        pageNumber={rp.pageNumber}
                                        canvas={rp.canvas}
                                        items={itemsByPage.get(rp.pageNumber) ?? []}
                                        pulsed={pulsed}
                                        onItemClick={handleItemClick}
                                    />
                                </FlipPage>
                            ))}
                        </HTMLFlipBook>
                    )}

                    {/* Navigation arrows */}
                    {!loading && !error && renderedPages.length > 1 && (
                        <>
                            {!isFirstPage && (
                                <button
                                    type="button"
                                    onClick={flipPrev}
                                    className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white/80 backdrop-blur-sm transition-all hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="size-5" />
                                </button>
                            )}
                            {!isLastPage && (
                                <button
                                    type="button"
                                    onClick={flipNext}
                                    className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white/80 backdrop-blur-sm transition-all hover:bg-black/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="size-5" />
                                </button>
                            )}
                        </>
                    )}

                    {/* Page indicator */}
                    {!loading && !error && totalPages > 1 && (
                        <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs tabular-nums text-white/80 backdrop-blur-sm">
                            {currentPage + 1} / {totalPages}
                        </div>
                    )}
                </div>
            </div>

            {/* Cart drawer */}
            <LookbookCartDrawer
                open={cartOpen}
                onOpenChange={setCartOpen}
                organizationId={organizationId}
                lookbookId={lookbookId}
            />
        </div>
    )
}

// ---------------------------------------------------------------------------
// PageWithHotZones — renders one PDF page canvas + hot-zone overlays
// ---------------------------------------------------------------------------

function PageWithHotZones({
    pageNumber,
    canvas,
    items,
    pulsed,
    onItemClick,
}: {
    pageNumber: number
    canvas: HTMLCanvasElement
    items: LookbookItemRow[]
    pulsed: boolean
    onItemClick: (item: LookbookItemRow) => void
}) {
    const slotRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const node = slotRef.current
        if (!node) return
        node.replaceChildren(canvas)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        canvas.style.display = 'block'
    }, [canvas])

    return (
        <section className="relative flex h-full items-center justify-center overflow-hidden bg-slate-900" data-page={pageNumber}>
            <div
                className="relative w-full"
                style={{
                    aspectRatio: `${canvas.width} / ${canvas.height}`,
                    maxHeight: '100%',
                }}
            >
                <div ref={slotRef} className="w-full" />

                {items.map((it) => {
                    const left = `${it.bbox_x * 100}%`
                    const top = `${it.bbox_y * 100}%`
                    const width = `${it.bbox_w * 100}%`
                    const height = `${it.bbox_h * 100}%`

                    return (
                        <button
                            key={it.id}
                            type="button"
                            onClick={() => onItemClick(it)}
                            className={
                                'group absolute z-10 rounded transition-all duration-200 cursor-pointer ' +
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ' +
                                (pulsed
                                    ? 'animate-hotzone-pulse '
                                    : 'border border-transparent hover:border-white/30 hover:bg-white/10 hover:shadow-[0_0_16px_rgba(255,255,255,0.2)] hover:scale-[1.03] ')
                            }
                            style={{
                                left,
                                top,
                                width,
                                height,
                                minWidth: 44,
                                minHeight: 44,
                                touchAction: 'manipulation',
                            }}
                            aria-label={it.item?.name ?? 'View item'}
                        >
                            {it.item?.name && (
                                <span className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    {it.item.name}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
        </section>
    )
}
