'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react'

import { useIsMobile } from '@/hooks/useIsMobile'
import { useLookbookCart, type LookbookCartItem } from '@/store/lookbook-cart'
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
// State machine
// ---------------------------------------------------------------------------

type ViewMode =
    | { kind: 'spread'; spreadIndex: number }
    | { kind: 'product'; item: LookbookItemRow; returnSpreadIndex: number }

type TransitionDir = 'forward' | 'backward' | null

type BookState = {
    viewMode: ViewMode
    transitionDir: TransitionDir
    isTransitioning: boolean
}

type BookAction =
    | { type: 'GO_NEXT_SPREAD'; maxIndex: number }
    | { type: 'GO_PREV_SPREAD' }
    | { type: 'GO_TO_PRODUCT'; item: LookbookItemRow; currentSpreadIndex: number }
    | { type: 'GO_BACK_TO_SPREAD' }
    | { type: 'TRANSITION_END' }
    | { type: 'JUMP_TO_SPREAD'; spreadIndex: number }

function bookReducer(state: BookState, action: BookAction): BookState {
    if (state.isTransitioning && action.type !== 'TRANSITION_END') return state

    switch (action.type) {
        case 'GO_NEXT_SPREAD': {
            if (state.viewMode.kind !== 'spread') return state
            const next = state.viewMode.spreadIndex + 1
            if (next > action.maxIndex) return state
            return {
                viewMode: { kind: 'spread', spreadIndex: next },
                transitionDir: 'forward',
                isTransitioning: true,
            }
        }
        case 'GO_PREV_SPREAD': {
            if (state.viewMode.kind !== 'spread') return state
            const prev = state.viewMode.spreadIndex - 1
            if (prev < 0) return state
            return {
                viewMode: { kind: 'spread', spreadIndex: prev },
                transitionDir: 'backward',
                isTransitioning: true,
            }
        }
        case 'GO_TO_PRODUCT': {
            return {
                viewMode: {
                    kind: 'product',
                    item: action.item,
                    returnSpreadIndex: action.currentSpreadIndex,
                },
                transitionDir: 'forward',
                isTransitioning: true,
            }
        }
        case 'GO_BACK_TO_SPREAD': {
            if (state.viewMode.kind !== 'product') return state
            return {
                viewMode: { kind: 'spread', spreadIndex: state.viewMode.returnSpreadIndex },
                transitionDir: 'backward',
                isTransitioning: true,
            }
        }
        case 'TRANSITION_END': {
            if (!state.isTransitioning) return state
            return { ...state, transitionDir: null, isTransitioning: false }
        }
        case 'JUMP_TO_SPREAD': {
            return {
                viewMode: { kind: 'spread', spreadIndex: action.spreadIndex },
                transitionDir: null,
                isTransitioning: false,
            }
        }
        default:
            return state
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeSpreads(pageCount: number, isMobile: boolean): number[][] {
    const spreads: number[][] = []
    if (isMobile) {
        for (let i = 1; i <= pageCount; i++) spreads.push([i])
    } else {
        for (let i = 1; i <= pageCount; i += 2) {
            if (i + 1 <= pageCount) spreads.push([i, i + 1])
            else spreads.push([i])
        }
    }
    return spreads
}

/** Find which spread contains a given page number */
function spreadIndexForPage(spreads: number[][], pageNum: number): number {
    const idx = spreads.findIndex((s) => s.includes(pageNum))
    return idx >= 0 ? idx : 0
}

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
    const bookFrameRef = useRef<HTMLDivElement>(null)
    const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [cartOpen, setCartOpen] = useState(false)
    const [pulsed, setPulsed] = useState(false)

    const isMobile = useIsMobile()
    const cart = useLookbookCart()

    const spreads = useMemo(
        () => computeSpreads(pageCount > 0 ? pageCount : renderedPages.length, isMobile),
        [pageCount, renderedPages.length, isMobile],
    )

    const [bookState, dispatch] = useReducer(bookReducer, {
        viewMode: { kind: 'spread', spreadIndex: 0 },
        transitionDir: null,
        isTransitioning: false,
    })

    // Track previous view for transition rendering
    const prevViewRef = useRef<ViewMode | null>(null)

    // Keep spread index in bounds when spreads recompute (e.g. breakpoint change)
    useEffect(() => {
        if (bookState.viewMode.kind !== 'spread') return
        if (spreads.length === 0) return
        const clamped = Math.min(bookState.viewMode.spreadIndex, spreads.length - 1)
        if (clamped !== bookState.viewMode.spreadIndex) {
            dispatch({ type: 'JUMP_TO_SPREAD', spreadIndex: clamped })
        }
    }, [spreads, bookState.viewMode])

    const itemsByPage = useMemo(() => {
        const map = new Map<number, LookbookItemRow[]>()
        for (const it of items) {
            const list = map.get(it.page_number) ?? []
            list.push(it)
            map.set(it.page_number, list)
        }
        return map
    }, [items])

    // PDF rendering (unchanged logic)
    useEffect(() => {
        let cancelled = false
        async function renderPdf() {
            try {
                const pdfjs = await import('pdfjs-dist')
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
                const loadingTask = pdfjs.getDocument({ url: pdfSignedUrl })
                const pdf = await loadingTask.promise
                if (cancelled) return

                const isDesktop = window.innerWidth >= 768
                const scale = isDesktop ? 1.5 : 1.0
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

    // Navigation handlers
    const goNext = useCallback(() => {
        if (bookState.viewMode.kind !== 'spread') return
        prevViewRef.current = bookState.viewMode
        dispatch({ type: 'GO_NEXT_SPREAD', maxIndex: spreads.length - 1 })
    }, [bookState.viewMode, spreads.length])

    const goPrev = useCallback(() => {
        if (bookState.viewMode.kind !== 'spread') return
        prevViewRef.current = bookState.viewMode
        dispatch({ type: 'GO_PREV_SPREAD' })
    }, [bookState.viewMode])

    const goToProduct = useCallback(
        (item: LookbookItemRow) => {
            if (!item.item) return
            const currentIdx =
                bookState.viewMode.kind === 'spread'
                    ? bookState.viewMode.spreadIndex
                    : 0
            prevViewRef.current = bookState.viewMode
            dispatch({ type: 'GO_TO_PRODUCT', item, currentSpreadIndex: currentIdx })
        },
        [bookState.viewMode],
    )

    const goBackFromProduct = useCallback(() => {
        prevViewRef.current = bookState.viewMode
        dispatch({ type: 'GO_BACK_TO_SPREAD' })
    }, [bookState.viewMode])

    const transitionFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleTransitionEnd = useCallback((e: React.AnimationEvent) => {
        if (e.target !== e.currentTarget) return
        if (transitionFallbackRef.current) {
            clearTimeout(transitionFallbackRef.current)
            transitionFallbackRef.current = null
        }
        dispatch({ type: 'TRANSITION_END' })
        prevViewRef.current = null
    }, [])

    // Fallback: clear stuck transitions if animationend never fires
    useEffect(() => {
        if (!bookState.isTransitioning) return
        transitionFallbackRef.current = setTimeout(() => {
            dispatch({ type: 'TRANSITION_END' })
            prevViewRef.current = null
        }, 500)
        return () => {
            if (transitionFallbackRef.current) clearTimeout(transitionFallbackRef.current)
        }
    }, [bookState.isTransitioning])

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && bookState.viewMode.kind === 'product') {
                e.preventDefault()
                goBackFromProduct()
                return
            }
            if (bookState.viewMode.kind !== 'spread') return
            if (e.key === 'ArrowRight') {
                e.preventDefault()
                goNext()
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                goPrev()
            }
        }
        document.addEventListener('keydown', handleKey)
        return () => document.removeEventListener('keydown', handleKey)
    }, [bookState.viewMode, goNext, goPrev, goBackFromProduct])

    // Touch swipe
    useEffect(() => {
        const el = bookFrameRef.current
        if (!el) return

        let startX = 0
        let startY = 0

        const onStart = (e: TouchEvent) => {
            startX = e.touches[0].clientX
            startY = e.touches[0].clientY
        }
        const onEnd = (e: TouchEvent) => {
            const dx = e.changedTouches[0].clientX - startX
            const dy = e.changedTouches[0].clientY - startY
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                if (dx < 0) goNext()
                else goPrev()
            }
        }

        el.addEventListener('touchstart', onStart, { passive: true })
        el.addEventListener('touchend', onEnd, { passive: true })
        return () => {
            el.removeEventListener('touchstart', onStart)
            el.removeEventListener('touchend', onEnd)
        }
    }, [goNext, goPrev])

    // Derive current spread info
    const currentSpread =
        bookState.viewMode.kind === 'spread'
            ? spreads[bookState.viewMode.spreadIndex] ?? []
            : []
    const currentSpreadIndex =
        bookState.viewMode.kind === 'spread'
            ? bookState.viewMode.spreadIndex
            : 0
    const isFirstSpread = currentSpreadIndex === 0
    const isLastSpread = currentSpreadIndex >= spreads.length - 1
    const totalPages = pageCount > 0 ? pageCount : renderedPages.length

    // Page indicator text
    const pageIndicator = (() => {
        if (bookState.viewMode.kind === 'product') return null
        const s = currentSpread
        if (s.length === 0) return null
        if (s.length === 1) return `${s[0]} / ${totalPages}`
        return `${s[0]}-${s[1]} / ${totalPages}`
    })()

    // Transition CSS class helpers
    const incomingClass =
        bookState.transitionDir === 'forward'
            ? 'animate-book-in-right'
            : bookState.transitionDir === 'backward'
              ? 'animate-book-in-left'
              : ''
    const outgoingClass =
        bookState.transitionDir === 'forward'
            ? 'animate-book-out-left'
            : bookState.transitionDir === 'backward'
              ? 'animate-book-out-right'
              : ''

    // ---------------------------------------------------------------------------
    // Render helpers
    // ---------------------------------------------------------------------------

    function renderSpread(spreadPages: number[]) {
        if (spreadPages.length === 0) return null

        const pageElements = spreadPages.map((pn) => {
            const rp = renderedPages.find((r) => r.pageNumber === pn)
            if (!rp) {
                return (
                    <div
                        key={pn}
                        className="flex aspect-[3/4] items-center justify-center bg-slate-900"
                    >
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-white" />
                    </div>
                )
            }
            return (
                <PageWithHotZones
                    key={pn}
                    pageNumber={pn}
                    canvas={rp.canvas}
                    items={itemsByPage.get(pn) ?? []}
                    pulsed={pulsed}
                    onItemClick={goToProduct}
                />
            )
        })

        // Desktop spread: two pages side by side
        if (!isMobile && spreadPages.length === 2) {
            return (
                <div className="grid h-full grid-cols-2">
                    {pageElements}
                </div>
            )
        }

        // Single page (mobile or last odd page)
        return (
            <div className="flex h-full items-center justify-center">
                <div className={isMobile ? 'w-full' : 'w-1/2'}>
                    {pageElements[0]}
                </div>
            </div>
        )
    }

    function renderView(mode: ViewMode) {
        if (mode.kind === 'product') {
            return (
                <ProductDetailPage
                    item={mode.item}
                    onBack={goBackFromProduct}
                    isMobile={isMobile}
                />
            )
        }
        const spreadPages = spreads[mode.spreadIndex] ?? []
        return renderSpread(spreadPages)
    }

    return (
        <div className="relative">
            {/* Minimal top bar */}
            <header className="mb-4 flex items-center justify-between">
                <div className="min-w-0">
                    <p className="text-xs uppercase tracking-widest text-slate-500">
                        {orgName}
                    </p>
                    <h1 className="truncate text-lg font-semibold">{lookbookTitle}</h1>
                </div>
                {cart.items.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setCartOpen(true)}
                        className="relative ml-4 rounded-full p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        aria-label={`Cart, ${cart.items.length} items`}
                    >
                        <ShoppingBag className="size-5" />
                        <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold tabular-nums text-white">
                            {cart.items.length}
                        </span>
                    </button>
                )}
            </header>

            {/* Book frame */}
            <div
                ref={bookFrameRef}
                className="relative overflow-hidden rounded-lg bg-slate-900"
                style={{ aspectRatio: isMobile ? '3 / 4' : '3 / 2' }}
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

                {!loading && !error && (
                    <>
                        {/* Outgoing content (during transition) */}
                        {bookState.isTransitioning && prevViewRef.current && (
                            <div
                                className={`absolute inset-0 ${outgoingClass}`}
                            >
                                {renderView(prevViewRef.current)}
                            </div>
                        )}

                        {/* Current content */}
                        <div
                            className={`absolute inset-0 ${bookState.isTransitioning ? incomingClass : ''}`}
                            onAnimationEnd={handleTransitionEnd}
                        >
                            {renderView(bookState.viewMode)}
                        </div>
                    </>
                )}

                {/* Navigation arrows (only in spread mode) */}
                {bookState.viewMode.kind === 'spread' && !loading && !error && spreads.length > 1 && (
                    <>
                        {!isFirstSpread && (
                            <button
                                type="button"
                                onClick={goPrev}
                                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/20 p-2 text-white/70 transition-colors hover:bg-black/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Previous page"
                            >
                                <ChevronLeft className="size-5" />
                            </button>
                        )}
                        {!isLastSpread && (
                            <button
                                type="button"
                                onClick={goNext}
                                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/20 p-2 text-white/70 transition-colors hover:bg-black/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Next page"
                            >
                                <ChevronRight className="size-5" />
                            </button>
                        )}
                    </>
                )}

                {/* Page indicator */}
                {pageIndicator && (
                    <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/30 px-3 py-1 text-xs tabular-nums text-white/70">
                        {pageIndicator}
                    </div>
                )}
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
        <section className="relative flex h-full items-center justify-center overflow-hidden" data-page={pageNumber}>
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
                                'absolute z-10 rounded transition-all duration-200 ' +
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ' +
                                (pulsed
                                    ? 'animate-hotzone-pulse '
                                    : 'border border-transparent hover:border-white/20 ')
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
                        />
                    )
                })}
            </div>
        </section>
    )
}
