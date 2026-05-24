'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'

type MatchStatus = 'needs_review' | 'auto_matched' | 'confirmed' | 'rejected_no_match'

type EditorItem = {
    id: string
    page_number: number
    bbox_x: number | null
    bbox_y: number | null
    bbox_w: number | null
    bbox_h: number | null
    match_status: MatchStatus
    match_confidence: number | null
    inventory_item_id: string | null
    session_visual_description: string | null
    session_visible_text: string | null
    session_position_label: string | null
    admin_notes: string | null
}

type InventoryItem = {
    id: string
    sku: string | null
    name: string | null
    rental_price: number | null
}

type Props = {
    orgSlug: string
    lookbookId: string
    title: string
    pageCount: number
    pdfSignedUrl: string | null
    published: boolean
    editorStatus: string
    items: EditorItem[]
    inventory: InventoryItem[]
}

const STATUS_COLORS: Record<MatchStatus, { border: string; fill: string; label: string }> = {
    auto_matched: {
        border: 'border-emerald-500',
        fill: 'bg-emerald-200/20',
        label: 'Auto-matched',
    },
    confirmed: {
        border: 'border-emerald-700',
        fill: 'bg-emerald-300/20',
        label: 'Confirmed',
    },
    needs_review: {
        border: 'border-muted-foreground/40 border-dashed',
        fill: 'bg-muted/40',
        label: 'Needs review',
    },
    rejected_no_match: {
        border: 'border-rose-400 border-dashed',
        fill: 'bg-rose-200/10',
        label: 'No match (suggest new SKU)',
    },
}

export function LookbookEditor({
    orgSlug,
    lookbookId,
    title,
    pageCount,
    pdfSignedUrl,
    published,
    editorStatus,
    items: initialItems,
    inventory,
}: Props) {
    const [items, setItems] = useState<EditorItem[]>(initialItems)
    const [activePage, setActivePage] = useState<number>(1)
    const [pageCanvas, setPageCanvas] = useState<HTMLCanvasElement | null>(null)
    const [renderError, setRenderError] = useState<string | null>(null)
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [showOnboarding, setShowOnboarding] = useState<boolean>(true)
    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<string | null>(null)
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
    const pdfRef = useRef<{ document: import('pdfjs-dist').PDFDocumentProxy | null }>({ document: null })

    const totalPages = pageCount > 0 ? pageCount : Math.max(1, ...items.map(it => it.page_number))

    const itemsByPage = useMemo(() => {
        const map = new Map<number, EditorItem[]>()
        for (const it of items) {
            if (deletedIds.has(it.id)) continue
            const list = map.get(it.page_number) ?? []
            list.push(it)
            map.set(it.page_number, list)
        }
        return map
    }, [items, deletedIds])

    const activeItems = itemsByPage.get(activePage) ?? []

    const counts = useMemo(() => {
        const c = { auto_matched: 0, confirmed: 0, needs_review: 0, rejected_no_match: 0, total: 0 }
        for (const it of items) {
            if (deletedIds.has(it.id)) continue
            c[it.match_status] += 1
            c.total += 1
        }
        return c
    }, [items, deletedIds])

    const processedPages = useMemo(() => {
        const set = new Set<number>()
        for (const it of items) {
            if (deletedIds.has(it.id)) continue
            if (it.match_status === 'auto_matched' || it.match_status === 'confirmed') {
                set.add(it.page_number)
            }
        }
        return set
    }, [items, deletedIds])

    useEffect(() => {
        if (!pdfSignedUrl) return
        let cancelled = false

        async function load() {
            try {
                const pdfjs = await import('pdfjs-dist')
                pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
                const doc = await pdfjs.getDocument({ url: pdfSignedUrl! }).promise
                if (cancelled) return
                pdfRef.current.document = doc
                await renderActivePage()
            } catch (err) {
                console.error('[LookbookEditor] load failed', err)
                if (!cancelled) setRenderError(err instanceof Error ? err.message : 'load failed')
            }
        }

        async function renderActivePage() {
            const doc = pdfRef.current.document
            if (!doc) return
            try {
                const page = await doc.getPage(Math.min(activePage, doc.numPages))
                const viewport = page.getViewport({ scale: 1.5 })
                const canvas = document.createElement('canvas')
                canvas.width = viewport.width
                canvas.height = viewport.height
                const ctx = canvas.getContext('2d')
                if (!ctx) throw new Error('canvas 2d context unavailable')
                await page.render({ canvasContext: ctx, viewport, canvas }).promise
                if (!cancelled) setPageCanvas(canvas)
            } catch (err) {
                console.error('[LookbookEditor] render failed', err)
                if (!cancelled) setRenderError(err instanceof Error ? err.message : 'render failed')
            }
        }

        if (pdfRef.current.document) {
            void renderActivePage()
        } else {
            void load()
        }

        return () => {
            cancelled = true
        }
    }, [activePage, pdfSignedUrl])

    const markDirty = useCallback((id: string) => {
        setDirtyIds(prev => {
            const next = new Set(prev)
            next.add(id)
            return next
        })
    }, [])

    const updateItem = useCallback((id: string, patch: Partial<EditorItem>) => {
        setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)))
        markDirty(id)
    }, [markDirty])

    const handleBboxChange = useCallback(
        (id: string, bbox: { x: number; y: number; w: number; h: number }) => {
            updateItem(id, {
                bbox_x: bbox.x,
                bbox_y: bbox.y,
                bbox_w: bbox.w,
                bbox_h: bbox.h,
            })
        },
        [updateItem],
    )

    const handleConfirm = useCallback((id: string) => {
        updateItem(id, { match_status: 'confirmed' })
    }, [updateItem])

    const handleRejectNoMatch = useCallback((id: string) => {
        updateItem(id, { match_status: 'rejected_no_match', inventory_item_id: null })
    }, [updateItem])

    const handleDelete = useCallback((id: string) => {
        setDeletedIds(prev => {
            const next = new Set(prev)
            next.add(id)
            return next
        })
        if (selectedItemId === id) setSelectedItemId(null)
    }, [selectedItemId])

    const handleAddBlank = useCallback(() => {
        const newId = `new:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`
        const blank: EditorItem = {
            id: newId,
            page_number: activePage,
            bbox_x: 0.4,
            bbox_y: 0.4,
            bbox_w: 0.2,
            bbox_h: 0.2,
            match_status: 'needs_review',
            match_confidence: null,
            inventory_item_id: null,
            session_visual_description: null,
            session_visible_text: null,
            session_position_label: null,
            admin_notes: null,
        }
        setItems(prev => [...prev, blank])
        setSelectedItemId(newId)
        markDirty(newId)
    }, [activePage, markDirty])

    const handleBulkConfirmAuto = useCallback(() => {
        for (const it of activeItems) {
            if (it.match_status === 'auto_matched') {
                updateItem(it.id, { match_status: 'confirmed' })
            }
        }
    }, [activeItems, updateItem])

    const handleSave = useCallback(async () => {
        setSaving(true)
        setSaveStatus('Saving…')
        try {
            const updates = items
                .filter(it => dirtyIds.has(it.id) && !deletedIds.has(it.id))
                .map(it => ({
                    id: it.id.startsWith('new:') ? null : it.id,
                    page_number: it.page_number,
                    bbox_x: it.bbox_x,
                    bbox_y: it.bbox_y,
                    bbox_w: it.bbox_w,
                    bbox_h: it.bbox_h,
                    match_status: it.match_status,
                    match_confidence: it.match_confidence,
                    inventory_item_id: it.inventory_item_id,
                    admin_notes: it.admin_notes,
                }))
            const deletes = Array.from(deletedIds).filter(id => !id.startsWith('new:'))

            const res = await fetch(`/api/admin/lookbooks/${lookbookId}/items/bulk`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ updates, deletes }),
            })
            if (!res.ok) {
                const errBody = await res.text().catch(() => '')
                throw new Error(`save failed (${res.status}) ${errBody}`)
            }
            await res.json().catch(() => null)
            setDirtyIds(new Set())
            setDeletedIds(new Set())
            setSaveStatus(`Saved ${updates.length} change${updates.length === 1 ? '' : 's'} · ${new Date().toLocaleTimeString()}`)
        } catch (err) {
            console.error('[LookbookEditor] save failed', err)
            setSaveStatus(err instanceof Error ? `Save failed — ${err.message}` : 'Save failed')
        } finally {
            setSaving(false)
        }
    }, [items, dirtyIds, deletedIds, lookbookId])

    useEffect(() => {
        if (dirtyIds.size === 0 && deletedIds.size === 0) return
        const t = setTimeout(() => {
            if (!saving) void handleSave()
        }, 60_000)
        return () => clearTimeout(t)
    }, [dirtyIds, deletedIds, handleSave, saving])

    useEffect(() => {
        function onBeforeUnload(ev: BeforeUnloadEvent) {
            if (dirtyIds.size > 0 || deletedIds.size > 0) {
                ev.preventDefault()
                ev.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [dirtyIds, deletedIds])

    const handlePublish = useCallback(async () => {
        setSaving(true)
        setSaveStatus('Publishing…')
        try {
            if (dirtyIds.size > 0 || deletedIds.size > 0) {
                await handleSave()
            }
            const res = await fetch(`/api/admin/lookbooks/${lookbookId}/publish`, {
                method: 'POST',
            })
            if (!res.ok) {
                const errBody = await res.text().catch(() => '')
                throw new Error(`publish failed (${res.status}) ${errBody}`)
            }
            setSaveStatus('Published — view live in a new tab')
        } catch (err) {
            console.error('[LookbookEditor] publish failed', err)
            setSaveStatus(err instanceof Error ? `Publish failed — ${err.message}` : 'Publish failed')
        } finally {
            setSaving(false)
        }
    }, [lookbookId, dirtyIds, deletedIds, handleSave])

    const selected = items.find(it => it.id === selectedItemId) ?? null

    if (!pdfSignedUrl) {
        return (
            <div className="p-6 text-rose-700">
                Lookbook PDF not found in storage. Run the ingest CLI first.
            </div>
        )
    }

    return (
        <div className="flex h-screen flex-col bg-muted/50">
            {showOnboarding && (
                <OnboardingTooltip onDismiss={() => setShowOnboarding(false)} />
            )}

            <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold text-foreground">{title}</h1>
                    <p className="text-xs text-muted-foreground">
                        {processedPages.size} of {totalPages} pages processed · {counts.total} item slots
                        ({counts.auto_matched} auto, {counts.confirmed} confirmed, {counts.needs_review} needs review)
                    </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                    {saveStatus && <span className="text-muted-foreground">{saveStatus}</span>}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || (dirtyIds.size === 0 && deletedIds.size === 0)}
                        className="rounded-md border border-input px-3 py-1.5 font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid="lookbook-editor-save"
                    >
                        Save
                    </button>
                    <button
                        type="button"
                        onClick={handlePublish}
                        disabled={saving || published}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid="lookbook-editor-publish"
                    >
                        {published ? 'Live' : 'Publish to storefront'}
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <main className="flex-1 overflow-auto">
                    <PageTabs
                        totalPages={totalPages}
                        activePage={activePage}
                        processedPages={processedPages}
                        onSelect={setActivePage}
                    />
                    <div className="p-4">
                        <PageBoard
                            canvas={pageCanvas}
                            items={activeItems}
                            selectedItemId={selectedItemId}
                            onSelect={setSelectedItemId}
                            onBboxChange={handleBboxChange}
                        />
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <button
                                type="button"
                                onClick={handleAddBlank}
                                className="rounded-md border border-input px-3 py-1.5 font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                                data-testid="lookbook-editor-add-bbox"
                            >
                                + Add hot-zone on this page
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkConfirmAuto}
                                disabled={activeItems.every(it => it.match_status !== 'auto_matched')}
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                data-testid="lookbook-editor-bulk-confirm"
                            >
                                Confirm all auto-matched on this page
                            </button>
                            {renderError && (
                                <span className="text-rose-600">PDF render: {renderError}</span>
                            )}
                        </div>
                    </div>
                </main>

                <aside className="w-96 shrink-0 overflow-y-auto border-l border-border bg-card p-4">
                    <Sidebar
                        item={selected}
                        inventory={inventory}
                        onUpdate={updateItem}
                        onConfirm={handleConfirm}
                        onRejectNoMatch={handleRejectNoMatch}
                        onDelete={handleDelete}
                    />
                </aside>
            </div>

            <div className="border-t border-border bg-card px-6 py-2 text-[11px] text-muted-foreground">
                Editor status: {editorStatus} · slug: {orgSlug}
            </div>
        </div>
    )
}

function PageBoard({
    canvas,
    items,
    selectedItemId,
    onSelect,
    onBboxChange,
}: {
    canvas: HTMLCanvasElement | null
    items: EditorItem[]
    selectedItemId: string | null
    onSelect: (id: string) => void
    onBboxChange: (id: string, bbox: { x: number; y: number; w: number; h: number }) => void
}) {
    const wrapperRef = useRef<HTMLDivElement | null>(null)
    const canvasSlotRef = useRef<HTMLDivElement | null>(null)
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

    useEffect(() => {
        const wrapper = wrapperRef.current
        if (!wrapper) return
        const observer = new ResizeObserver(() => {
            setSize({ w: wrapper.clientWidth, h: wrapper.clientHeight })
        })
        observer.observe(wrapper)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        const slot = canvasSlotRef.current
        if (!slot || !canvas) return
        slot.replaceChildren(canvas)
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        canvas.style.display = 'block'
    }, [canvas])

    return (
        <div className="relative inline-block w-full max-w-3xl" ref={wrapperRef}>
            <div ref={canvasSlotRef} className="relative overflow-hidden rounded-md border border-input bg-muted" />
            {items.map(it => {
                const colors = STATUS_COLORS[it.match_status]
                const hasBbox = it.bbox_x !== null && it.bbox_y !== null && it.bbox_w !== null && it.bbox_h !== null
                if (!hasBbox || !size.w || !size.h) return null
                const px = (it.bbox_x as number) * size.w
                const py = (it.bbox_y as number) * size.h
                const pw = (it.bbox_w as number) * size.w
                const ph = (it.bbox_h as number) * size.h
                const isSelected = selectedItemId === it.id
                return (
                    <Rnd
                        key={it.id}
                        size={{ width: pw, height: ph }}
                        position={{ x: px, y: py }}
                        bounds="parent"
                        onMouseDown={() => onSelect(it.id)}
                        onDragStop={(_, d) => {
                            onBboxChange(it.id, {
                                x: d.x / size.w,
                                y: d.y / size.h,
                                w: pw / size.w,
                                h: ph / size.h,
                            })
                        }}
                        onResizeStop={(_, __, ref, ___, position) => {
                            onBboxChange(it.id, {
                                x: position.x / size.w,
                                y: position.y / size.h,
                                w: ref.offsetWidth / size.w,
                                h: ref.offsetHeight / size.h,
                            })
                        }}
                        className={`group ${colors.border} ${colors.fill} border-2 ${isSelected ? 'ring-2 ring-offset-1 ring-emerald-500' : ''}`}
                        data-testid={`lookbook-editor-bbox-${it.id}`}
                    >
                        <span className="pointer-events-none absolute -top-5 left-0 rounded bg-background/90 px-1 text-[10px] font-medium text-foreground shadow">
                            {colors.label}
                        </span>
                    </Rnd>
                )
            })}
        </div>
    )
}

function OnboardingTooltip({ onDismiss }: { onDismiss: () => void }) {
    return (
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm text-emerald-800">
            <div className="flex items-start gap-3">
                <div className="flex-1">
                    <p className="font-medium">First time here?</p>
                    <p className="mt-1 text-xs">
                        <span className="rounded bg-emerald-200 px-1">Green</span> boxes were matched automatically — quickly skim and click <em>Confirm</em>.{' '}
                        <span className="rounded bg-muted px-1">Grey</span> boxes need a hot-zone you draw. Pages with no boxes need everything added by you.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-xs text-emerald-700 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                    Got it
                </button>
            </div>
        </div>
    )
}

function PageTabs({
    totalPages,
    activePage,
    processedPages,
    onSelect,
}: {
    totalPages: number
    activePage: number
    processedPages: Set<number>
    onSelect: (page: number) => void
}) {
    return (
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 py-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                const isActive = page === activePage
                const isProcessed = processedPages.has(page)
                return (
                    <button
                        key={page}
                        type="button"
                        onClick={() => onSelect(page)}
                        className={
                            'min-w-[2.5rem] rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ' +
                            (isActive
                                ? 'bg-emerald-600 text-white'
                                : isProcessed
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'bg-muted text-muted-foreground hover:bg-muted')
                        }
                        data-testid={`lookbook-editor-page-${page}`}
                    >
                        {page}
                    </button>
                )
            })}
        </div>
    )
}

function Sidebar({
    item,
    inventory,
    onUpdate,
    onConfirm,
    onRejectNoMatch,
    onDelete,
}: {
    item: EditorItem | null
    inventory: InventoryItem[]
    onUpdate: (id: string, patch: Partial<EditorItem>) => void
    onConfirm: (id: string) => void
    onRejectNoMatch: (id: string) => void
    onDelete: (id: string) => void
}) {
    if (!item) {
        return (
            <div className="text-sm text-muted-foreground">
                Click any green or grey box on the page to edit it, or add a new hot-zone with the
                button below the page.
            </div>
        )
    }

    return (
        <div className="space-y-4 text-sm">
            <header>
                <p className="text-xs uppercase tracking-wide text-muted-foreground/70">
                    Page {item.page_number}
                </p>
                <h2 className="text-base font-semibold text-foreground">
                    {STATUS_COLORS[item.match_status].label}
                </h2>
                {item.match_confidence !== null && (
                    <p className="text-xs text-muted-foreground">
                        Confidence: {Math.round(item.match_confidence * 100)}%
                    </p>
                )}
            </header>

            <div>
                <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="inventory-select">
                    Match to inventory
                </label>
                <select
                    id="inventory-select"
                    name="inventory_item_id"
                    value={item.inventory_item_id ?? ''}
                    onChange={ev => onUpdate(item.id, { inventory_item_id: ev.target.value || null })}
                    className="w-full rounded-md border border-input px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    data-testid="lookbook-editor-inventory-select"
                >
                    <option value="">— select item —</option>
                    {inventory.map(inv => (
                        <option key={inv.id} value={inv.id}>
                            {inv.sku} · {inv.name}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="admin-notes">
                    Notes
                </label>
                <textarea
                    id="admin-notes"
                    name="admin_notes"
                    value={item.admin_notes ?? ''}
                    onChange={ev => onUpdate(item.id, { admin_notes: ev.target.value })}
                    placeholder="e.g. customer-facing colour…"
                    className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    rows={3}
                />
            </div>

            {(item.session_visual_description || item.session_visible_text || item.session_position_label) && (
                <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Lende suggestion</p>
                    {item.session_visible_text && <p className="mt-1">SKU text: {item.session_visible_text}</p>}
                    {item.session_visual_description && (
                        <p className="mt-1 line-clamp-3">{item.session_visual_description}</p>
                    )}
                    {item.session_position_label && (
                        <p className="mt-1 text-muted-foreground">Suggested position: {item.session_position_label}</p>
                    )}
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {item.match_status !== 'confirmed' && (
                    <button
                        type="button"
                        onClick={() => onConfirm(item.id)}
                        disabled={!item.inventory_item_id}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid="lookbook-editor-confirm"
                    >
                        Confirm match
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onRejectNoMatch(item.id)}
                    className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                    Suggest new SKU
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Delete
                </button>
            </div>
        </div>
    )
}
