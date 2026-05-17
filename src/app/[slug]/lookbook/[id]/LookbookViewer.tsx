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
    pageNumber: number        // logical 1-indexed page (after split)
    originalPdfPage: number   // 1-indexed PDF page
    half: 'full' | 'left' | 'right'
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
    // Holds the product being faded out so the back-animation has something
    // to render after showProduct has been cleared. ~300ms after Back is
    // pressed, this resets to null and the detail overlay unmounts.
    const [closingProduct, setClosingProduct] = useState<LookbookItemRow | null>(null)
    const [containerSize, setContainerSize] = useState({ width: 600, height: 800 })
    const [flipKey, setFlipKey] = useState(0)

    const isMobile = useIsMobile()
    const cart = useLookbookCart()

    // After splitting landscape PDF pages into halves, the logical page count
    // is determined by the rendered output, not the raw PDF page count.
    const totalPages = renderedPages.length || pageCount

    const itemsByOriginalPage = useMemo(() => {
        const map = new Map<number, LookbookItemRow[]>()
        for (const it of items) {
            const list = map.get(it.page_number) ?? []
            list.push(it)
            map.set(it.page_number, list)
        }
        return map
    }, [items])

    // Re-map hot-zone bbox coords for split halves of a landscape PDF page.
    // Original bbox_x/w are relative to the full PDF page; after splitting the
    // page into left/right halves, items move to the half they fall into and
    // their x/w get scaled by 2.
    const itemsForRenderedPage = useCallback(
        (rp: RenderedPage): LookbookItemRow[] => {
            const all = itemsByOriginalPage.get(rp.originalPdfPage) ?? []
            if (rp.half === 'full') return all
            const eps = 0.01
            if (rp.half === 'left') {
                return all
                    .filter(it => it.bbox_x + it.bbox_w <= 0.5 + eps)
                    .map(it => ({
                        ...it,
                        bbox_x: it.bbox_x * 2,
                        bbox_w: it.bbox_w * 2,
                    }))
            }
            return all
                .filter(it => it.bbox_x >= 0.5 - eps)
                .map(it => ({
                    ...it,
                    bbox_x: (it.bbox_x - 0.5) * 2,
                    bbox_w: it.bbox_w * 2,
                }))
        },
        [itemsByOriginalPage],
    )

    // Measure viewport for single-page flip book. Use the real aspect ratio of
    // the first rendered page (after landscape splitting) so the container
    // exactly matches the page shape — no over-crop, no letterboxing.
    useEffect(() => {
        if (typeof window === 'undefined') return

        const measure = () => {
            const padding = 32 // 16px on each side
            const viewportW = window.innerWidth - padding
            const viewportH = window.innerHeight - padding
            const firstCanvas = renderedPages[0]?.canvas
            const aspectRatio = firstCanvas
                ? firstCanvas.width / firstCanvas.height
                : 3 / 4 // portrait fallback before PDF is rendered

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
    }, [renderedPages])

    // PDF rendering — render page 1 fast for instant feedback, then render
    // the rest in parallel. Mount flipbook only when ALL pages are ready so
    // react-pageflip (which caches children on mount) sees the full count.
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

                // Render one PDF page. If it's a landscape spread (designer
                // baked two logical pages into one PDF page), crop into left
                // and right halves so the viewer always shows a portrait page.
                async function renderOne(n: number): Promise<RenderedPage[]> {
                    const page = await pdf.getPage(n)
                    const viewport = page.getViewport({ scale })
                    const fullCanvas = document.createElement('canvas')
                    fullCanvas.width = viewport.width
                    fullCanvas.height = viewport.height
                    const ctx = fullCanvas.getContext('2d')
                    if (!ctx) throw new Error('could not get 2d context')
                    await page.render({
                        canvasContext: ctx,
                        viewport,
                        canvas: fullCanvas,
                    }).promise

                    const isLandscape = viewport.width > viewport.height
                    if (!isLandscape) {
                        return [{
                            pageNumber: 0, // assigned later
                            originalPdfPage: n,
                            half: 'full',
                            canvas: fullCanvas,
                        }]
                    }

                    const halfW = Math.floor(viewport.width / 2)
                    const h = viewport.height

                    const leftCanvas = document.createElement('canvas')
                    leftCanvas.width = halfW
                    leftCanvas.height = h
                    leftCanvas.getContext('2d')!.drawImage(
                        fullCanvas, 0, 0, halfW, h, 0, 0, halfW, h,
                    )

                    const rightCanvas = document.createElement('canvas')
                    rightCanvas.width = halfW
                    rightCanvas.height = h
                    rightCanvas.getContext('2d')!.drawImage(
                        fullCanvas, halfW, 0, halfW, h, 0, 0, halfW, h,
                    )

                    return [
                        { pageNumber: 0, originalPdfPage: n, half: 'left', canvas: leftCanvas },
                        { pageNumber: 0, originalPdfPage: n, half: 'right', canvas: rightCanvas },
                    ]
                }

                // Worker pool — fully parallel renders can exhaust connection
                // limits to Supabase Storage range requests; cap at 4 in flight.
                const CONCURRENCY = 4
                const grouped: RenderedPage[][] = new Array(total)
                let nextIdx = 1
                async function worker() {
                    while (!cancelled) {
                        const n = nextIdx++
                        if (n > total) return
                        grouped[n - 1] = await renderOne(n)
                    }
                }
                await Promise.all(
                    Array.from({ length: Math.min(CONCURRENCY, total) }, worker),
                )
                if (cancelled) return

                // Flatten in PDF order and assign logical 1-indexed page numbers.
                const out: RenderedPage[] = []
                for (const group of grouped) {
                    if (!group) continue
                    for (const rp of group) {
                        out.push({ ...rp, pageNumber: out.length + 1 })
                    }
                }
                setRenderedPages(out)
                setLoading(false)
                setFlipKey(k => k + 1)
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

    // Pre-warm product hero images so the detail view appears instantly when
    // a hot zone is clicked. Uses the HTMLImageElement cache — no DOM nodes
    // attached, browser caches the bytes for later reuse.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const seen = new Set<string>()
        for (const it of items) {
            const url = it.item?.images?.[0]
            if (!url || seen.has(url)) continue
            seen.add(url)
            const img = new window.Image()
            img.decoding = 'async'
            img.src = url
        }
    }, [items])

    // Navigation
    const flipNext = useCallback(() => {
        flipBookRef.current?.pageFlip()?.flipNext()
    }, [])

    const flipPrev = useCallback(() => {
        flipBookRef.current?.pageFlip()?.flipPrev()
    }, [])

    const goBackFromProduct = useCallback(() => {
        setShowProduct(prev => {
            if (prev) setClosingProduct(prev)
            return null
        })
        window.setTimeout(() => setClosingProduct(null), 300)
    }, [])

    const handleItemClick = useCallback((item: LookbookItemRow) => {
        if (!item.item) return
        setClosingProduct(null) // cancel any in-flight close animation
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
                    {(showProduct || closingProduct) && (
                        <div
                            key={`detail-${(showProduct ?? closingProduct)!.id}`}
                            className={
                                'absolute inset-0 z-20 ' +
                                (showProduct
                                    ? 'lookbook-page-flip-in'
                                    : 'lookbook-page-flip-out pointer-events-none')
                            }
                        >
                            <ProductDetailPage
                                item={(showProduct ?? closingProduct)!}
                                onBack={goBackFromProduct}
                                isMobile={isMobile}
                            />
                        </div>
                    )}
                    {/* Book stays mounted underneath the detail overlay so the
                        flipbook does not re-mount on close, and the fade-out
                        animation reveals the book smoothly. */}
                    <>
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
                                    width={containerSize.width}
                                    height={containerSize.height}
                                    size="fixed"
                                    minWidth={280}
                                    maxWidth={2400}
                                    minHeight={370}
                                    maxHeight={2400}
                                    drawShadow={true}
                                    flippingTime={550}
                                    usePortrait={true}
                                    maxShadowOpacity={0.5}
                                    showCover={false}
                                    showPageCorners={false}
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
                                                items={itemsForRenderedPage(rp)}
                                                pulsed={pulsed}
                                                onItemClick={handleItemClick}
                                            />
                                        </FlipPage>
                                    ))}
                                </HTMLFlipBook>
                            )}

                        </>
                </div>
            </div>

            {/* Floating bottom-right page controls — compact, low noise */}
            {!showProduct && !loading && !error && totalPages > 1 && (
                <div className="absolute bottom-4 right-4 z-30 flex items-center gap-0.5 rounded-full bg-slate-900/50 px-1 py-1 backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={flipPrev}
                        disabled={isFirstPage}
                        className="rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                    <span className="px-1.5 text-[11px] tabular-nums text-white/70">
                        {currentPage + 1} / {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={flipNext}
                        disabled={isLastPage}
                        className="rounded-full p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label="Next page"
                    >
                        <ChevronRight className="size-4" />
                    </button>
                </div>
            )}

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
