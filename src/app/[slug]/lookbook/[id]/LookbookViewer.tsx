'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type LookbookItemRow = {
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
        images: string[] | null
    } | null
}

type Props = {
    orgSlug: string
    lookbookId: string
    pageCount: number
    pdfSignedUrl: string
    items: LookbookItemRow[]
}

type RenderedPage = {
    pageNumber: number
    canvas: HTMLCanvasElement
}

const DESKTOP_MIN_VIEWPORT = 768

export function LookbookViewer({ orgSlug, pageCount, pdfSignedUrl, items }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeItemId, setActiveItemId] = useState<string | null>(null)

    const itemsByPage = useMemo(() => {
        const map = new Map<number, LookbookItemRow[]>()
        for (const it of items) {
            const list = map.get(it.page_number) ?? []
            list.push(it)
            map.set(it.page_number, list)
        }
        return map
    }, [items])

    useEffect(() => {
        let cancelled = false

        async function renderPdf() {
            try {
                // Lazy import — pdfjs-dist worker is heavy and ESM-only.
                const pdfjs = await import('pdfjs-dist')
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

                const loadingTask = pdfjs.getDocument({ url: pdfSignedUrl })
                const pdf = await loadingTask.promise
                if (cancelled) return

                const isDesktop = window.innerWidth >= DESKTOP_MIN_VIEWPORT
                const scale = isDesktop ? 1.5 : 1.0
                const total = pageCount > 0 ? pageCount : pdf.numPages

                const out: RenderedPage[] = []
                for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
                    if (cancelled) return
                    const page = await pdf.getPage(pageNumber)
                    const viewport = page.getViewport({ scale })
                    const canvas = document.createElement('canvas')
                    canvas.width = viewport.width
                    canvas.height = viewport.height
                    const ctx = canvas.getContext('2d')
                    if (!ctx) throw new Error('could not get 2d context')
                    await page.render({ canvasContext: ctx, viewport, canvas }).promise
                    out.push({ pageNumber, canvas })
                    if (pageNumber === 1) {
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
        return () => {
            cancelled = true
        }
    }, [pdfSignedUrl, pageCount])

    const handleItemActivate = useCallback((id: string) => {
        setActiveItemId(prev => (prev === id ? null : id))
    }, [])

    return (
        <div ref={containerRef} className="space-y-8">
            {loading && (
                <p className="text-center text-slate-300">Loading lookbook…</p>
            )}
            {error && (
                <p className="text-center text-rose-300">Failed to load lookbook ({error})</p>
            )}

            {renderedPages.map(({ pageNumber, canvas }) => (
                <PageWithHotZones
                    key={pageNumber}
                    pageNumber={pageNumber}
                    canvas={canvas}
                    items={itemsByPage.get(pageNumber) ?? []}
                    orgSlug={orgSlug}
                    activeItemId={activeItemId}
                    onItemActivate={handleItemActivate}
                />
            ))}
        </div>
    )
}

function PageWithHotZones({
    pageNumber,
    canvas,
    items,
    orgSlug,
    activeItemId,
    onItemActivate,
}: {
    pageNumber: number
    canvas: HTMLCanvasElement
    items: LookbookItemRow[]
    orgSlug: string
    activeItemId: string | null
    onItemActivate: (id: string) => void
}) {
    const slotRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const node = slotRef.current
        if (!node) return
        // Replace the existing canvas if the page re-renders.
        node.replaceChildren(canvas)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        canvas.style.display = 'block'
    }, [canvas])

    return (
        <section className="relative rounded-md bg-slate-100" data-page={pageNumber}>
            <div ref={slotRef} className="relative" />
            {items.map(it => {
                const left = `${it.bbox_x * 100}%`
                const top = `${it.bbox_y * 100}%`
                const width = `${it.bbox_w * 100}%`
                const height = `${it.bbox_h * 100}%`
                const isActive = activeItemId === it.id
                return (
                    <button
                        key={it.id}
                        type="button"
                        onClick={() => onItemActivate(it.id)}
                        className={
                            'absolute z-10 flex items-end justify-start text-left ' +
                            'rounded-md border-2 transition-colors duration-150 ' +
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
                            (isActive
                                ? 'border-emerald-300 bg-emerald-300/10 '
                                : 'border-transparent hover:border-emerald-300/60 hover:bg-emerald-300/5 ')
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
                        data-testid={`lookbook-hotzone-${it.id}`}
                    >
                        {isActive && (
                            <ItemPopover orgSlug={orgSlug} item={it} />
                        )}
                    </button>
                )
            })}
        </section>
    )
}

function ItemPopover({ orgSlug, item }: { orgSlug: string; item: LookbookItemRow }) {
    const detail = item.item
    const itemId = item.inventory_item_id ?? detail?.id
    const price = detail?.rental_price
    const priceText = price !== null && price !== undefined && price !== ''
        ? typeof price === 'number'
            ? `£${price.toFixed(0)}`
            : `£${price}`
        : null
    return (
        <div
            className="pointer-events-auto absolute -bottom-2 left-1/2 z-20 w-48 -translate-x-1/2 translate-y-full rounded-md bg-white p-3 text-slate-900 shadow-lg ring-1 ring-slate-200"
            onClick={ev => ev.stopPropagation()}
        >
            <p className="line-clamp-2 text-sm font-medium">
                {detail?.name ?? 'View item'}
            </p>
            {priceText && (
                <p className="mt-1 text-xs text-slate-500">{priceText}</p>
            )}
            {itemId && (
                <Link
                    href={`/${orgSlug}/catalog/${itemId}`}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                >
                    View &amp; Reserve
                </Link>
            )}
        </div>
    )
}
