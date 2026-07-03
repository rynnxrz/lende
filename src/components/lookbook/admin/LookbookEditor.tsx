'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Rnd } from 'react-rnd'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { ProductImage } from '@/components/catalog/ProductImage'
import { uploadItemImage } from '@/actions/items'

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
    synced_image_url: string | null
}

type InventoryItem = {
    id: string
    organization_id?: string | null
    sku: string | null
    name: string | null
    description?: string | null
    status?: string | null
    category_id?: string | null
    collection_id?: string | null
    material?: string | null
    weight?: string | null
    color?: string | null
    replacement_cost?: number | null
    rental_price: number | null
    image_paths: string[] | null
    specs?: Record<string, unknown> | null
    updated_at?: string | null
}

type PagePreview = {
    src: string
    width: number
    height: number
} | null

type CreateSkuInput = {
    sku: string
    name: string
    description: string | null
    jewelryType: string | null
    size: string | null
    material: string | null
    color: string | null
    weight: string | null
    replacementCost: number | null
}

type Props = {
    orgSlug: string
    lookbookId: string
    title: string
    pageCount: number
    pdfSignedUrl: string | null
    published: boolean
    editorStatus: string
    categories: Array<{ id: string; name: string }>
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

function buildSuggestedSkuNote(item: EditorItem) {
    const details = [
        item.session_visible_text?.trim() && `detected text: ${item.session_visible_text.trim()}`,
        item.session_position_label?.trim() && `position: ${item.session_position_label.trim()}`,
    ].filter(Boolean)

    return details.length > 0
        ? `Suggest new SKU (${details.join(', ')})`
        : 'Suggest new SKU'
}

export function LookbookEditor({
    orgSlug,
    lookbookId,
    title,
    pageCount,
    pdfSignedUrl,
    published,
    editorStatus,
    categories,
    items: initialItems,
    inventory,
}: Props) {
    const [items, setItems] = useState<EditorItem[]>(initialItems)
    // Grows when the editor creates a new SKU from an unmatched zone.
    const [inventoryList, setInventoryList] = useState<InventoryItem[]>(inventory)
    // Honour a ?page=N deep-link (from the lookbook match column and the
    // coverage drill-down) so the editor opens on the relevant page.
    const searchParams = useSearchParams()
    const [activePage, setActivePage] = useState<number>(() => {
        const requested = Number(searchParams.get('page'))
        if (!Number.isFinite(requested) || requested < 1) return 1
        return pageCount > 0 ? Math.min(requested, pageCount) : requested
    })
    const [pageCanvas, setPageCanvas] = useState<HTMLCanvasElement | null>(null)
    const [renderError, setRenderError] = useState<string | null>(null)
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [showOnboarding, setShowOnboarding] = useState<boolean>(false)
    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<string | null>(null)
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
    const [fetchedInventoryItem, setFetchedInventoryItem] = useState<InventoryItem | null>(null)
    const [liveInventoryLoading, setLiveInventoryLoading] = useState(false)
    const [liveInventoryError, setLiveInventoryError] = useState<string | null>(null)
    const [inventoryRefreshTick, setInventoryRefreshTick] = useState(0)
    const [syncingFromPdf, setSyncingFromPdf] = useState(false)
    const [creatingSku, setCreatingSku] = useState(false)
    const [autoSaveTick, setAutoSaveTick] = useState(0)
    const [researchSku, setResearchSku] = useState('')
    const [researching, setResearching] = useState(false)
    const [pdfDocument, setPdfDocument] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null)

    // Show the onboarding banner only until it's dismissed once on this browser.
    useEffect(() => {
        setShowOnboarding(localStorage.getItem('lookbook-editor-onboarding-dismissed') !== '1')
    }, [])
    const dismissOnboarding = useCallback(() => {
        localStorage.setItem('lookbook-editor-onboarding-dismissed', '1')
        setShowOnboarding(false)
    }, [])
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

    const activeItems = useMemo(() => itemsByPage.get(activePage) ?? [], [itemsByPage, activePage])

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
                setPdfDocument(doc)
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
                canvas.style.width = '100%'
                canvas.style.height = 'auto'
                canvas.style.display = 'block'
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

    const pagePreview = useMemo<PagePreview>(() => {
        if (!pageCanvas) return null
        try {
            return {
                src: pageCanvas.toDataURL('image/png'),
                width: pageCanvas.width,
                height: pageCanvas.height,
            }
        } catch (err) {
            console.error('[LookbookEditor] preview encode failed', err)
            return null
        }
    }, [pageCanvas])

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
        const item = items.find(it => it.id === id)
        updateItem(id, {
            match_status: 'rejected_no_match',
            inventory_item_id: null,
            admin_notes: item?.admin_notes?.trim() ? item.admin_notes : item ? buildSuggestedSkuNote(item) : null,
        })
    }, [items, updateItem])

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
            synced_image_url: null,
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

    const handleResearchSku = useCallback(async (ev: FormEvent<HTMLFormElement>) => {
        ev.preventDefault()
        const sku = researchSku.trim()
        if (!sku) return

        setResearching(true)
        setSaveStatus(`Searching ${sku}…`)
        try {
            const res = await fetch(`/api/admin/items/search?org=${encodeURIComponent(orgSlug)}&sku=${encodeURIComponent(sku)}`, {
                method: 'GET',
                cache: 'no-store',
            })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(body || `search failed (${res.status})`)
            }
            const payload = await res.json() as { item?: InventoryItem }
            const found = payload.item
            if (!found) {
                setSaveStatus(`No live DB item found for ${sku}`)
                return
            }

            setInventoryList(prev => [found, ...prev.filter(row => row.id !== found.id)])
            setFetchedInventoryItem(found)

            const normalizedSku = sku.toLocaleLowerCase()
            const target = items.find(it => !deletedIds.has(it.id) && it.inventory_item_id === found.id)
                ?? items.find(it => !deletedIds.has(it.id) && it.session_visible_text?.toLocaleLowerCase().includes(normalizedSku))

            if (!target) {
                setSaveStatus(`Found ${found.sku ?? sku} in DB, but no lookbook zone is linked or OCR-matched`)
                return
            }

            setActivePage(target.page_number)
            setSelectedItemId(target.id)
            if (target.inventory_item_id !== found.id) {
                updateItem(target.id, { inventory_item_id: found.id, match_status: 'confirmed' })
                setSaveStatus(`Found ${found.sku ?? sku}; linked matching zone on page ${target.page_number} — Save to persist`)
            } else {
                setSaveStatus(`Found ${found.sku ?? sku}; jumped to page ${target.page_number}`)
            }
        } catch (err) {
            console.error('[LookbookEditor] research failed', err)
            setSaveStatus(err instanceof Error ? `Search failed — ${err.message}` : 'Search failed')
        } finally {
            setResearching(false)
        }
    }, [deletedIds, items, orgSlug, researchSku, updateItem])

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
                    synced_image_url: it.synced_image_url,
                }))
            const deletes = Array.from(deletedIds).filter(id => !id.startsWith('new:'))

            const res = await fetch(`/api/admin/lookbooks/${lookbookId}/items/bulk`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ updates, deletes }),
            })
            if (!res.ok) {
                const fallback = await res.text().catch(() => '')
                let detail = fallback
                try {
                    const payload = JSON.parse(fallback) as { detail?: string; error?: string }
                    detail = payload.detail ?? payload.error ?? fallback
                } catch {
                    // keep plain-text fallback
                }
                throw new Error(detail ? `${res.status} ${detail}` : `save failed (${res.status})`)
            }
            const payload = await res.json().catch(() => null) as
                | { items?: EditorItem[]; deleted?: number }
                | null
            const byId = new Map(payload?.items?.map(it => [it.id, it]) ?? [])
            // Rows sent with a new: id come back with fresh server ids, in the
            // order they were sent — swap them in so a later save doesn't
            // insert duplicates.
            const sentNewIds = items
                .filter(it => dirtyIds.has(it.id) && !deletedIds.has(it.id) && it.id.startsWith('new:'))
                .map(it => it.id)
            const knownIds = new Set(items.map(it => it.id))
            const insertedRows = (payload?.items ?? []).filter(row => !knownIds.has(row.id))
            const newIdMap = new Map<string, EditorItem>()
            sentNewIds.forEach((clientId, index) => {
                if (insertedRows[index]) newIdMap.set(clientId, insertedRows[index])
            })
            setItems(prev => prev
                .filter(it => !deletedIds.has(it.id))
                .map(it => newIdMap.get(it.id) ?? byId.get(it.id) ?? it))
            setSelectedItemId(prev => (prev && newIdMap.has(prev) ? newIdMap.get(prev)!.id : prev))
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
    const selectedInventoryId = selected?.inventory_item_id ?? null
    const selectedInventory = selectedInventoryId
        ? fetchedInventoryItem?.id === selectedInventoryId
            ? fetchedInventoryItem
            : inventoryList.find(inv => inv.id === selectedInventoryId) ?? null
        : null

    const selectedBbox = selected
        && selected.bbox_x !== null && selected.bbox_y !== null
        && selected.bbox_w !== null && selected.bbox_h !== null
        ? { x: selected.bbox_x, y: selected.bbox_y, w: selected.bbox_w, h: selected.bbox_h }
        : null

    // The exact zone crop that Sync / Create SKU will upload, so the admin can
    // verify the image is right before pushing it to the live DB.
    const [zonePreview, setZonePreview] = useState<ZonePreview>(null)
    useEffect(() => {
        const pageNumber = selected?.page_number
        if (!selectedBbox || pageNumber === undefined) {
            setZonePreview(null)
            return
        }
        let cancelled = false
        setZonePreview(null)
        void (async () => {
            const zone = await getZoneImage(
                pdfRef.current.document,
                pageNumber === activePage ? pageCanvas : null,
                pageNumber,
                selectedBbox,
            )
            if (cancelled || !zone) return
            try {
                setZonePreview({ src: zone.canvas.toDataURL('image/png'), source: zone.source })
            } catch {
                // preview is best-effort only
            }
        })()
        return () => {
            cancelled = true
        }
    }, [pageCanvas, selectedBbox?.x, selectedBbox?.y, selectedBbox?.w, selectedBbox?.h, selected?.page_number, activePage]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const inventoryId = selectedInventoryId
        if (!inventoryId) {
            return
        }

        const cached = inventoryList.find(inv => inv.id === inventoryId) ?? null

        const controller = new AbortController()
        let cancelled = false

        async function loadLiveInventory() {
            setLiveInventoryLoading(true)
            setLiveInventoryError(null)
            try {
                const res = await fetch(`/api/admin/items/${inventoryId}`, {
                    method: 'GET',
                    cache: 'no-store',
                    signal: controller.signal,
                    headers: { 'content-type': 'application/json' },
                })
                if (!res.ok) {
                    const body = await res.text().catch(() => '')
                    throw new Error(body || `failed to load inventory (${res.status})`)
                }
                const payload = await res.json() as { item?: InventoryItem }
                if (!cancelled) {
                    setFetchedInventoryItem(payload.item ?? cached)
                }
            } catch (err) {
                if (cancelled) return
                console.error('[LookbookEditor] live inventory fetch failed', err)
                setLiveInventoryError(err instanceof Error ? err.message : 'failed to load inventory')
            } finally {
                if (!cancelled) setLiveInventoryLoading(false)
            }
        }

        void loadLiveInventory()

        return () => {
            cancelled = true
            controller.abort()
        }
    }, [selectedInventoryId, inventoryList, inventoryRefreshTick])

    const handleSyncInventory = useCallback(() => {
        setInventoryRefreshTick(tick => tick + 1)
    }, [])

    // Core of Sync: upload the zone image and merge it into the inventory row,
    // replacing whatever this zone synced before (synced_image_url).
    const syncZoneToInventory = useCallback(async (item: EditorItem, inv: InventoryItem) => {
        const bbox = item.bbox_x !== null && item.bbox_y !== null && item.bbox_w !== null && item.bbox_h !== null
            ? { x: item.bbox_x, y: item.bbox_y, w: item.bbox_w, h: item.bbox_h }
            : null
        if (!bbox) throw new Error('draw a bounding box first')

        const doc = pdfRef.current.document
        const zone = await getZoneImage(
            doc,
            item.page_number === activePage ? pageCanvas : null,
            item.page_number,
            bbox,
        )
        if (!zone) throw new Error('PDF page is still rendering — try again in a moment')

        const blob = await canvasToBlob(zone.canvas, 'image/png')
        const baseName = fileBaseName([inv.sku, inv.name])
        const uploadForm = new FormData()
        uploadForm.append('file', new File(
            [blob],
            `${baseName || `lookbook-page-${item.page_number}`}.png`,
            { type: 'image/png' },
        ))
        const upload = await uploadItemImage(uploadForm)
        if (!upload.success || !upload.url) {
            throw new Error(upload.error || 'image upload failed')
        }

        const fields = await extractZoneFields(doc, item.page_number, bbox)
        // Per admin decision: the lookbook is the source of truth — each sync
        // replaces the whole gallery with the freshly extracted image, so old
        // wrong crops never linger.
        const patch: Record<string, unknown> = { image_paths: [upload.url] }
        if (fields?.sku) patch.sku = fields.sku
        if (fields?.name) patch.name = fields.name
        if (fields?.description) patch.description = fields.description
        if (fields?.jewelryType) patch.jewelry_type = fields.jewelryType
        if (fields?.size) patch.size = fields.size
        if (fields?.material) patch.material = fields.material
        if (fields?.color) patch.color = fields.color
        if (fields?.weight) patch.weight = fields.weight
        if (fields?.replacementCost !== null && fields?.replacementCost !== undefined) {
            patch.replacement_cost = fields.replacementCost
            // Same derivation as ItemForm: weekly rate 15% of RRP, daily = /7.
            patch.rental_price = deriveDailyRentalFromRrp(fields.replacementCost)
        }

        const res = await fetch(`/api/admin/items/${inv.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
        })
        if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(text || `item sync failed (${res.status})`)
        }
        const payload = await res.json().catch(() => null) as { item?: InventoryItem } | null
        return { updated: payload?.item ?? null, url: upload.url }
    }, [activePage, pageCanvas])

    const syncOneItemToDatabase = useCallback(async (item: EditorItem, inv: InventoryItem) => {
        const { updated, url } = await syncZoneToInventory(item, inv)
        updateItem(item.id, { synced_image_url: url })
        if (updated) {
            setFetchedInventoryItem(prev => (prev?.id === updated.id ? updated : prev))
            setInventoryList(prev => prev.map(row => (row.id === updated.id ? updated : row)))
        }
        return updated ?? inv
    }, [syncZoneToInventory, updateItem])

    const handleSyncPdfToDatabase = useCallback(async () => {
        if (!selected || !selectedInventoryId || !selectedInventory) {
            setSaveStatus('Sync unavailable — select a matched inventory row first')
            return
        }

        setSyncingFromPdf(true)
        setSaveStatus('Syncing PDF image to live DB…')
        try {
            await syncOneItemToDatabase(selected, selectedInventory)
            setInventoryRefreshTick(tick => tick + 1)
            setSaveStatus(`Synced PDF image to live DB · ${new Date().toLocaleTimeString()}`)
        } catch (err) {
            console.error('[LookbookEditor] pdf sync failed', err)
            setSaveStatus(err instanceof Error ? `Sync failed — ${err.message}` : 'Sync failed')
        } finally {
            setSyncingFromPdf(false)
        }
    }, [selected, selectedInventory, selectedInventoryId, syncOneItemToDatabase])

    const syncItemsToDatabase = useCallback(async (targets: EditorItem[], label: string) => {
        if (targets.length === 0) return

        setSyncingFromPdf(true)
        let ok = 0
        let failed = 0
        const inventoryById = new Map(inventoryList.map(row => [row.id, row]))
        try {
            // ponytail: fixed pool of 4 — enough to overlap upload/PATCH latency
            // without hammering the API; raise if the server proves happy.
            let next = 0
            let done = 0
            setSaveStatus(`Syncing ${label} 0/${targets.length}…`)
            const worker = async () => {
                while (next < targets.length) {
                    const target = targets[next++]
                    const inv = target.inventory_item_id ? inventoryById.get(target.inventory_item_id) : null
                    if (!inv) {
                        failed += 1
                    } else {
                        try {
                            const updated = await syncOneItemToDatabase(target, inv)
                            inventoryById.set(updated.id, updated)
                            ok += 1
                        } catch (err) {
                            console.error('[LookbookEditor] bulk sync failed for', target.id, err)
                            failed += 1
                        }
                    }
                    done += 1
                    setSaveStatus(`Syncing ${label} ${done}/${targets.length}…`)
                }
            }
            await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker))
            setInventoryRefreshTick(tick => tick + 1)
            setInventoryList(prev => prev.map(row => inventoryById.get(row.id) ?? row))
            setSaveStatus(`Synced ${ok} item${ok === 1 ? '' : 's'} (info + image)${failed > 0 ? `, ${failed} failed` : ''} · ${new Date().toLocaleTimeString()}`)
        } finally {
            setSyncingFromPdf(false)
        }
    }, [inventoryList, syncOneItemToDatabase])

    const isSyncableMatch = useCallback((it: EditorItem) => {
        return (
            !deletedIds.has(it.id) &&
            (it.match_status === 'auto_matched' || it.match_status === 'confirmed') &&
            !!it.inventory_item_id &&
            it.bbox_x !== null &&
            it.bbox_y !== null &&
            it.bbox_w !== null &&
            it.bbox_h !== null
        )
    }, [deletedIds])

    const handleBulkSyncPage = useCallback(async () => {
        await syncItemsToDatabase(activeItems.filter(isSyncableMatch), 'page item')
    }, [activeItems, isSyncableMatch, syncItemsToDatabase])

    const handleBulkSyncAll = useCallback(async () => {
        await syncItemsToDatabase(items.filter(isSyncableMatch), 'lookbook item')
    }, [isSyncableMatch, items, syncItemsToDatabase])

    const handleCreateSku = useCallback(async (id: string, input: CreateSkuInput) => {
        const item = items.find(it => it.id === id)
        if (!item) return

        const bbox = item.bbox_x !== null && item.bbox_y !== null && item.bbox_w !== null && item.bbox_h !== null
            ? { x: item.bbox_x, y: item.bbox_y, w: item.bbox_w, h: item.bbox_h }
            : null
        if (!bbox) {
            setSaveStatus('Draw a bounding box first — the new SKU needs a zone crop as its image')
            return
        }

        setCreatingSku(true)
        setSaveStatus('Creating SKU from zone…')
        try {
            const zone = await getZoneImage(
                pdfRef.current.document,
                item.page_number === activePage ? pageCanvas : null,
                item.page_number,
                bbox,
            )
            if (!zone) throw new Error('PDF page is still rendering — try again in a moment')

            const blob = await canvasToBlob(zone.canvas, 'image/png')
            const baseName = fileBaseName([input.sku, input.name])
            const uploadForm = new FormData()
            uploadForm.append('file', new File(
                [blob],
                `${baseName || `lookbook-page-${item.page_number}`}.png`,
                { type: 'image/png' },
            ))
            const upload = await uploadItemImage(uploadForm)
            if (!upload.success || !upload.url) {
                throw new Error(upload.error || 'image upload failed')
            }

            const res = await fetch(`/api/admin/lookbooks/${lookbookId}/items/create-sku`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    sku: input.sku,
                    name: input.name,
                    description: input.description,
                    jewelry_type: input.jewelryType,
                    size: input.size,
                    material: input.material,
                    color: input.color,
                    weight: input.weight,
                    replacement_cost: input.replacementCost,
                    image_url: upload.url,
                }),
            })
            if (!res.ok) {
                const fallback = await res.text().catch(() => '')
                let detail = fallback
                try {
                    const payload = JSON.parse(fallback) as { detail?: string; error?: string }
                    detail = typeof payload.detail === 'string' ? payload.detail : payload.error ?? fallback
                } catch {
                    // keep plain-text fallback
                }
                throw new Error(detail || `create failed (${res.status})`)
            }
            const payload = await res.json() as { item: InventoryItem }

            setInventoryList(prev => [payload.item, ...prev])
            updateItem(id, { inventory_item_id: payload.item.id, match_status: 'confirmed', synced_image_url: upload.url })
            setSaveStatus(`Created SKU ${payload.item.sku} — saving match…`)
            // Save the confirmed match right away so create is one click.
            setAutoSaveTick(tick => tick + 1)
        } catch (err) {
            console.error('[LookbookEditor] create sku failed', err)
            setSaveStatus(err instanceof Error ? `Create SKU failed — ${err.message}` : 'Create SKU failed')
        } finally {
            setCreatingSku(false)
        }
    }, [items, pageCanvas, activePage, lookbookId, updateItem])

    // Runs handleSave one render after create-SKU links the zone, so the save
    // sees the updated items state.
    const autoSaveHandled = useRef(0)
    useEffect(() => {
        if (autoSaveTick === 0 || autoSaveHandled.current === autoSaveTick) return
        autoSaveHandled.current = autoSaveTick
        void handleSave()
    }, [autoSaveTick, handleSave])

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
                <OnboardingTooltip onDismiss={dismissOnboarding} />
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
                    <form onSubmit={handleResearchSku} className="flex items-center gap-1">
                        <input
                            value={researchSku}
                            onChange={ev => setResearchSku(ev.target.value)}
                            placeholder="Research SKU"
                            className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            data-testid="lookbook-editor-research-sku"
                        />
                        <button
                            type="submit"
                            disabled={researching || !researchSku.trim()}
                            className="h-8 rounded-md border border-input px-3 font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {researching ? 'Searching…' : 'Research'}
                        </button>
                    </form>
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
                            <button
                                type="button"
                                onClick={handleBulkSyncPage}
                                disabled={syncingFromPdf || activeItems.every(it => !isSyncableMatch(it))}
                                title="Update every matched item on this page from the lookbook: info (SKU, name, type, size, material, colour, weight, RRP) + image"
                                className="rounded-md border border-input px-3 py-1.5 font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                data-testid="lookbook-editor-bulk-sync"
                            >
                                {syncingFromPdf ? 'Syncing…' : 'Sync page info + images'}
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkSyncAll}
                                disabled={syncingFromPdf || items.every(it => !isSyncableMatch(it))}
                                title="Update every matched item in the whole lookbook from the PDF: info (SKU, name, type, size, material, colour, weight, RRP) + image"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                data-testid="lookbook-editor-sync-all-matched"
                            >
                                {syncingFromPdf ? 'Syncing…' : 'Sync all info + images'}
                            </button>
                            {renderError && (
                                <span className="text-rose-600">PDF render: {renderError}</span>
                            )}
                        </div>
                    </div>
                </main>

                <aside className="w-[26rem] shrink-0 overflow-y-auto border-l border-border bg-card p-4">
                    <MatchSidebar
                        item={selected}
                        pageItems={activeItems}
                        inventory={inventoryList}
                        pagePreview={pagePreview}
                        pdfDocument={pdfDocument}
                        creatingSku={creatingSku}
                        onSelect={setSelectedItemId}
                        onUpdate={updateItem}
                        onConfirm={handleConfirm}
                        onRejectNoMatch={handleRejectNoMatch}
                        onDelete={handleDelete}
                        onCreateSku={handleCreateSku}
                    />
                </aside>

                <aside className="w-[28rem] shrink-0 overflow-y-auto border-l border-border bg-muted/30 p-4">
                <DatabaseSidebar
                    item={selected}
                    inventoryItem={selectedInventory}
                    loading={liveInventoryLoading}
                    syncing={syncingFromPdf}
                    error={liveInventoryError}
                    zonePreview={zonePreview}
                    categories={categories}
                    onSync={handleSyncPdfToDatabase}
                    onRefresh={handleSyncInventory}
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

function MatchSidebar({
    item,
    pageItems,
    inventory,
    pagePreview,
    pdfDocument,
    creatingSku,
    onSelect,
    onUpdate,
    onConfirm,
    onRejectNoMatch,
    onDelete,
    onCreateSku,
}: {
    item: EditorItem | null
    pageItems: EditorItem[]
    inventory: InventoryItem[]
    pagePreview: PagePreview
    pdfDocument: import('pdfjs-dist').PDFDocumentProxy | null
    creatingSku: boolean
    onSelect: (id: string) => void
    onUpdate: (id: string, patch: Partial<EditorItem>) => void
    onConfirm: (id: string) => void
    onRejectNoMatch: (id: string) => void
    onDelete: (id: string) => void
    onCreateSku: (id: string, input: CreateSkuInput) => void
}) {
    const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false)

    if (!item) {
        return (
            <div className="space-y-3 text-sm text-muted-foreground">
                <p>Pick a zone below or click a box on the page. Add new zones with the button under the page.</p>
                <ZoneList items={pageItems} inventory={inventory} onSelect={onSelect} />
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

            <PageInspector
                key={`${pagePreview?.src ?? 'no-preview'}-${item.id}`}
                pagePreview={pagePreview}
                item={item}
            />

            <div>
                <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="inventory-select">
                    Match to inventory
                </label>
                <Popover open={inventoryPickerOpen} onOpenChange={setInventoryPickerOpen}>
                    <PopoverTrigger asChild>
                        <button
                            id="inventory-select"
                            type="button"
                            role="combobox"
                            aria-expanded={inventoryPickerOpen}
                            aria-controls="inventory-select-list"
                            className="flex w-full items-center justify-between rounded-md border border-input px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            data-testid="lookbook-editor-inventory-select"
                        >
                            <span className="truncate">
                                {item.inventory_item_id
                                    ? (() => {
                                        const selected = inventory.find(inv => inv.id === item.inventory_item_id)
                                        return selected ? `${selected.sku} · ${selected.name}` : '— select item —'
                                    })()
                                    : '— select item —'}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent id="inventory-select-list" className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search by SKU or name…" />
                            <CommandList>
                                <CommandEmpty>No item found.</CommandEmpty>
                                <CommandGroup>
                                    {inventory.map(inv => (
                                        <CommandItem
                                            key={inv.id}
                                            value={`${inv.sku ?? ''} ${inv.name ?? ''}`}
                                            onSelect={() => {
                                                onUpdate(item.id, { inventory_item_id: inv.id })
                                                setInventoryPickerOpen(false)
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4',
                                                    item.inventory_item_id === inv.id ? 'opacity-100' : 'opacity-0'
                                                )}
                                            />
                                            {inv.sku} · {inv.name}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
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

            {!item.inventory_item_id && (
                <CreateSkuPanel
                    key={item.id}
                    item={item}
                    pdfDocument={pdfDocument}
                    creating={creatingSku}
                    onCreate={input => onCreateSku(item.id, input)}
                />
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

const ZONE_DOT: Record<MatchStatus, string> = {
    confirmed: 'bg-emerald-600',
    auto_matched: 'bg-emerald-400',
    needs_review: 'bg-slate-400',
    rejected_no_match: 'bg-rose-400',
}

// Selection targets on the page canvas can be tiny; this list is the
// full-size alternative for picking a zone.
function ZoneList({
    items,
    inventory,
    onSelect,
}: {
    items: EditorItem[]
    inventory: InventoryItem[]
    onSelect: (id: string) => void
}) {
    if (items.length === 0) {
        return <p className="text-xs text-muted-foreground">No zones on this page yet.</p>
    }
    return (
        <ul className="space-y-1">
            {items.map((it, index) => {
                const inv = it.inventory_item_id ? inventory.find(row => row.id === it.inventory_item_id) : null
                const label = inv
                    ? [inv.sku, inv.name].filter(Boolean).join(' · ')
                    : it.session_visible_text?.trim() || `Zone ${index + 1}`
                return (
                    <li key={it.id}>
                        <button
                            type="button"
                            onClick={() => onSelect(it.id)}
                            className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            data-testid={`lookbook-editor-zone-row-${it.id}`}
                        >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${ZONE_DOT[it.match_status]}`} />
                            <span className="truncate">{label}</span>
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                {STATUS_COLORS[it.match_status].label}
                            </span>
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}

function CreateSkuPanel({
    item,
    pdfDocument,
    creating,
    onCreate,
}: {
    item: EditorItem
    pdfDocument: import('pdfjs-dist').PDFDocumentProxy | null
    creating: boolean
    onCreate: (input: CreateSkuInput) => void
}) {
    const [sku, setSku] = useState(item.session_visible_text?.trim() ?? '')
    const [name, setName] = useState(item.session_position_label?.trim() ?? '')
    const [description, setDescription] = useState(item.session_visual_description?.trim() ?? '')
    const [jewelryType, setJewelryType] = useState('')
    const [size, setSize] = useState('')
    const [material, setMaterial] = useState('')
    const [color, setColor] = useState('')
    const [weight, setWeight] = useState('')
    const [replacementCost, setReplacementCost] = useState('')

    useEffect(() => {
        const bbox = item.bbox_x !== null && item.bbox_y !== null && item.bbox_w !== null && item.bbox_h !== null
            ? { x: item.bbox_x, y: item.bbox_y, w: item.bbox_w, h: item.bbox_h }
            : null
        if (!bbox || !pdfDocument) return

        let cancelled = false
        void extractZoneFields(pdfDocument, item.page_number, bbox)
            .then(fields => {
                if (cancelled || !fields) return
                if (fields.sku) setSku(fields.sku)
                if (fields.name) setName(fields.name)
                if (fields.description) setDescription(fields.description)
                if (fields.jewelryType) setJewelryType(fields.jewelryType)
                if (fields.size) setSize(fields.size)
                if (fields.material) setMaterial(fields.material)
                if (fields.color) setColor(fields.color)
                if (fields.weight) setWeight(fields.weight)
                if (fields.replacementCost !== null) setReplacementCost(String(fields.replacementCost))
            })

        return () => {
            cancelled = true
        }
    }, [pdfDocument, item.page_number, item.bbox_x, item.bbox_y, item.bbox_w, item.bbox_h])

    return (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-xs font-medium text-foreground">
                No match yet — create a new SKU from this zone
            </p>
            <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku">SKU</label>
                <input
                    id="new-sku"
                    value={sku}
                    onChange={ev => setSku(ev.target.value)}
                    placeholder="e.g. RB-DAS-TSBL001"
                    className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                />
            </div>
            <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-name">Name</label>
                <input
                    id="new-sku-name"
                    value={name}
                    onChange={ev => setName(ev.target.value)}
                    placeholder="Product name"
                    className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-type">Type</label>
                    <input
                        id="new-sku-type"
                        value={jewelryType}
                        onChange={ev => setJewelryType(ev.target.value)}
                        placeholder="e.g. Earring"
                        className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-size">Size</label>
                    <input
                        id="new-sku-size"
                        value={size}
                        onChange={ev => setSize(ev.target.value)}
                        placeholder="e.g. OS"
                        className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    />
                    <div className="mt-1 flex flex-wrap gap-1">
                        {getQuickSizesForJewelryType(jewelryType).map(option => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setSize(option)}
                                className="rounded-md border border-input px-2 py-1 text-[11px] text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-material">Material</label>
                    <input
                        id="new-sku-material"
                        value={material}
                        onChange={ev => setMaterial(ev.target.value)}
                        className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-color">Colour</label>
                    <input
                        id="new-sku-color"
                        value={color}
                        onChange={ev => setColor(ev.target.value)}
                        className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-weight">Weight</label>
                    <input
                        id="new-sku-weight"
                        value={weight}
                        onChange={ev => setWeight(ev.target.value)}
                        className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-rrp">RRP</label>
                    <input
                        id="new-sku-rrp"
                        type="number"
                        min="0"
                        step="0.01"
                        value={replacementCost}
                        onChange={ev => setReplacementCost(ev.target.value)}
                        className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    />
                </div>
            </div>
            <div>
                <label className="mb-1 block text-[11px] font-medium text-foreground" htmlFor="new-sku-description">Description</label>
                <textarea
                    id="new-sku-description"
                    value={description}
                    onChange={ev => setDescription(ev.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-input px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                />
            </div>
            <button
                type="button"
                onClick={() => {
                    const rrp = Number(replacementCost)
                    onCreate({
                        sku: sku.trim(),
                        name: name.trim(),
                        description: description.trim() || null,
                        jewelryType: jewelryType.trim() || null,
                        size: size.trim() || null,
                        material: material.trim() || null,
                        color: color.trim() || null,
                        weight: weight.trim() || null,
                        replacementCost: Number.isFinite(rrp) && rrp > 0 ? rrp : null,
                    })
                }}
                disabled={creating || !sku.trim() || !name.trim()}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="lookbook-editor-create-sku"
            >
                {creating ? 'Creating…' : 'Create new SKU & confirm match'}
            </button>
        </div>
    )
}

function DatabaseSidebar({
    item,
    inventoryItem,
    loading,
    syncing,
    error,
    zonePreview,
    categories,
    onSync,
    onRefresh,
}: {
    item: EditorItem | null
    inventoryItem: InventoryItem | null
    loading: boolean
    syncing: boolean
    error: string | null
    zonePreview: ZonePreview
    categories: Array<{ id: string; name: string }>
    onSync: () => void
    onRefresh: () => void
}) {
    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground/70">Current DB</p>
                        <h2 className="mt-1 text-base font-semibold text-foreground">Matched item</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onSync}
                        disabled={!item?.inventory_item_id || loading || syncing}
                        title="Upload the image below into this item's photos"
                        className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                        data-testid="lookbook-editor-sync"
                    >
                        {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                </div>
                {zonePreview && (
                    <div className="mt-3 rounded-lg border border-border bg-white p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                                Image that will sync
                            </p>
                            <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    zonePreview.source === 'embedded'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                }`}
                            >
                                {zonePreview.source === 'embedded' ? 'Original PDF image' : 'Rendered crop'}
                            </span>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={zonePreview.src}
                            alt="Image that will be uploaded"
                            className="max-h-40 w-full rounded-md object-contain"
                        />
                        {zonePreview.source === 'render' && (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                                No embedded photo found — resize the box until it covers the piece.
                            </p>
                        )}
                    </div>
                )}
                {error && (
                    <p className="mt-2 text-[11px] text-amber-700">
                        Live fetch failed, showing cached row if available: {error}
                    </p>
                )}
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={!item?.inventory_item_id || loading || syncing}
                    className="mt-3 rounded-md border border-dashed border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? 'Refreshing…' : 'Refresh live DB'}
                </button>
            </div>
            <InventorySnapshot item={item} inventoryItem={inventoryItem} categories={categories} />
        </div>
    )
}

function PageInspector({
    pagePreview,
    item,
}: {
    pagePreview: PagePreview
    item: EditorItem
}) {
    const frameRef = useRef<HTMLDivElement | null>(null)
    const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
    const [frameSize, setFrameSize] = useState({ w: 0, h: 0 })
    const [pan, setPan] = useState({ x: 0, y: 0 })

    const bbox = item.bbox_x !== null && item.bbox_y !== null && item.bbox_w !== null && item.bbox_h !== null
        ? {
            x: item.bbox_x,
            y: item.bbox_y,
            w: item.bbox_w,
            h: item.bbox_h,
        }
        : null

    useEffect(() => {
        const frame = frameRef.current
        if (!frame) return
        const observer = new ResizeObserver(() => {
            setFrameSize({ w: frame.clientWidth, h: frame.clientHeight })
        })
        observer.observe(frame)
        return () => observer.disconnect()
    }, [])

    if (!pagePreview) {
        return (
            <section className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-medium text-foreground">Inspect page</p>
                        <p className="text-[11px] text-muted-foreground">Preview loads after the PDF page renders.</p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">Live</span>
                </div>
            </section>
        )
    }

    const scale = 2.2
    const layerWidth = pagePreview.width * scale
    const layerHeight = pagePreview.height * scale
    const baseTranslate = !frameSize.w || !frameSize.h
        ? { x: 0, y: 0 }
        : {
            x: frameSize.w / 2 - (bbox ? (bbox.x + bbox.w / 2) * pagePreview.width : pagePreview.width / 2) * scale,
            y: frameSize.h / 2 - (bbox ? (bbox.y + bbox.h / 2) * pagePreview.height : pagePreview.height / 2) * scale,
        }
    const translate = {
        x: baseTranslate.x + pan.x,
        y: baseTranslate.y + pan.y,
    }
    const bboxLayer = bbox ? {
        left: bbox.x * layerWidth,
        top: bbox.y * layerHeight,
        width: bbox.w * layerWidth,
        height: bbox.h * layerHeight,
    } : null

    return (
        <section className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-foreground">Inspect page</p>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700" title="Drag to pan">Zoomed</span>
            </div>

            <div
                ref={frameRef}
                className="mt-3 relative h-[360px] overflow-hidden rounded-lg border border-border bg-white"
            >
                <div
                    className="absolute left-0 top-0 cursor-grab active:cursor-grabbing"
                    style={{
                        width: `${layerWidth}px`,
                        height: `${layerHeight}px`,
                        transform: `translate(${translate.x}px, ${translate.y}px)`,
                        touchAction: 'none',
                    }}
                    onPointerDown={ev => {
                        ev.currentTarget.setPointerCapture(ev.pointerId)
                        dragRef.current = {
                            startX: ev.clientX,
                            startY: ev.clientY,
                            panX: pan.x,
                            panY: pan.y,
                        }
                    }}
                    onPointerMove={ev => {
                        if (!dragRef.current) return
                        const dx = ev.clientX - dragRef.current.startX
                        const dy = ev.clientY - dragRef.current.startY
                        setPan({
                            x: dragRef.current.panX + dx,
                            y: dragRef.current.panY + dy,
                        })
                    }}
                    onPointerUp={() => {
                        dragRef.current = null
                    }}
                    onPointerCancel={() => {
                        dragRef.current = null
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={pagePreview.src}
                        alt={`Page ${item.page_number}`}
                        width={pagePreview.width}
                        height={pagePreview.height}
                        draggable={false}
                        className="block select-none pointer-events-none"
                        style={{
                            width: `${layerWidth}px`,
                            height: `${layerHeight}px`,
                        }}
                    />
                    {bboxLayer && (
                        <div
                            className="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-400/10 shadow-[0_0_0_9999px_rgba(255,255,255,0.06)]"
                            style={bboxLayer}
                        />
                    )}
                </div>
            </div>
        </section>
    )
}

function InventorySnapshot({
    item,
    inventoryItem,
    categories,
}: {
    item: EditorItem | null
    inventoryItem: InventoryItem | null
    categories: Array<{ id: string; name: string }>
}) {
    if (!item) {
        return (
            <section className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">Current DB</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                    Choose a match to see its live database record here.
                </p>
            </section>
        )
    }

    if (!inventoryItem) {
        return (
            <section className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">Current DB</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                    This match does not yet point at a live inventory row.
                </p>
            </section>
        )
    }

    const images = (inventoryItem.image_paths ?? []).filter((src): src is string => typeof src === 'string' && src.length > 0)
    const headline = inventoryItem.sku ? `${inventoryItem.sku}` : inventoryItem.name ?? 'Inventory item'
    const price = inventoryItem.rental_price !== null ? `£${inventoryItem.rental_price.toFixed(2)}` : null
    const replacementCost = inventoryItem.replacement_cost !== null && inventoryItem.replacement_cost !== undefined
        ? `£${inventoryItem.replacement_cost.toFixed(2)}`
        : null

    return (
        <section className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">Inventory record</p>
                    <p className="truncate text-[11px] text-muted-foreground">{headline}</p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700">
                    Live DB
                </span>
            </div>

            <div className="mt-3">
                <div className="rounded-lg border border-border bg-white p-2">
                    <ProductImage
                        src={images[0] ?? null}
                        alt={inventoryItem.name ?? inventoryItem.sku ?? 'Inventory image'}
                        className="h-56 w-full rounded-md bg-slate-50 p-2"
                    />
                </div>
                {images.length > 1 && (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        {images.slice(0, 3).map((src, index) => (
                            <div key={`${src}-${index}`} className="rounded-md border border-border bg-white p-1">
                                <ProductImage
                                    src={src}
                                    alt={`${inventoryItem.name ?? inventoryItem.sku ?? 'Inventory image'} ${index + 1}`}
                                    className="h-16 w-full rounded-sm bg-slate-50 p-1"
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <dl className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Name</dt>
                    <dd className="truncate text-right">{inventoryItem.name ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">SKU</dt>
                    <dd className="truncate text-right">{inventoryItem.sku ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Rental</dt>
                    <dd className="text-right">{price ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">RRP</dt>
                    <dd className="text-right">{replacementCost ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Status</dt>
                    <dd className="text-right">{inventoryItem.status ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Category</dt>
                    <dd className="truncate text-right">
                        {inventoryItem.category_id
                            ? categories.find(c => c.id === inventoryItem.category_id)?.name ?? inventoryItem.category_id
                            : '—'}
                    </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Material</dt>
                    <dd className="truncate text-right">{inventoryItem.material ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Color</dt>
                    <dd className="truncate text-right">{inventoryItem.color ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Weight</dt>
                    <dd className="truncate text-right">{inventoryItem.weight ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground">Images</dt>
                    <dd className="text-right">{images.length > 0 ? `${images.length} live image${images.length === 1 ? '' : 's'}` : 'No images on file'}</dd>
                </div>
                {inventoryItem.updated_at && (
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-foreground">Updated</dt>
                        <dd className="text-right">{new Date(inventoryItem.updated_at).toLocaleString()}</dd>
                    </div>
                )}
                {inventoryItem.description && (
                    <div className="pt-1">
                        <dt className="text-foreground">Description</dt>
                        <dd className="mt-1 line-clamp-4 text-right text-[11px] leading-5 text-muted-foreground">
                            {inventoryItem.description}
                        </dd>
                    </div>
                )}
            </dl>
        </section>
    )
}

function cropCanvasRegion(
    source: HTMLCanvasElement,
    bbox: { x: number; y: number; w: number; h: number },
) {
    const sx = clamp(Math.floor(bbox.x * source.width), 0, Math.max(0, source.width - 1))
    const sy = clamp(Math.floor(bbox.y * source.height), 0, Math.max(0, source.height - 1))
    const sw = clamp(Math.ceil(bbox.w * source.width), 1, Math.max(1, source.width - sx))
    const sh = clamp(Math.ceil(bbox.h * source.height), 1, Math.max(1, source.height - sy))
    const crop = document.createElement('canvas')
    crop.width = sw
    crop.height = sh
    const ctx = crop.getContext('2d')
    if (!ctx) {
        throw new Error('crop canvas 2d context unavailable')
    }
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
    return crop
}

type Bbox = { x: number; y: number; w: number; h: number }
type ZoneImage = { canvas: HTMLCanvasElement; source: 'embedded' | 'render' }
type ZonePreview = { src: string; source: 'embedded' | 'render' } | null

type ZoneFields = {
    sku: string | null
    name: string | null
    jewelryType: string | null
    size: string | null
    material: string | null
    color: string | null
    weight: string | null
    replacementCost: number | null
    description: string | null
}

// Read the PDF text layer inside (a padded version of) the zone and parse the
// spec block ("Style: … / Material: … / Colour: … / RRP: …") so a new SKU can
// be created without retyping anything.
async function extractZoneFields(
    doc: import('pdfjs-dist').PDFDocumentProxy | null,
    pageNumber: number,
    bbox: Bbox,
): Promise<ZoneFields | null> {
    if (!doc) return null
    try {
        const page = await doc.getPage(Math.min(pageNumber, doc.numPages))
        const [px0, py0, px1, py1] = page.view
        const pageW = px1 - px0
        const pageH = py1 - py0
        const content = await page.getTextContent()

        // Zones are often drawn tight to the values with the "Style:" /
        // "Description:" labels just left of the box — pad generously so the
        // labels come along (grid cells sit ~a full zone-width apart, so this
        // stays clear of neighbours).
        const pad = 0.35
        const zx0 = bbox.x - bbox.w * pad
        const zx1 = bbox.x + bbox.w * (1 + pad)
        const zy0 = bbox.y - bbox.h * pad
        const zy1 = bbox.y + bbox.h * (1 + pad)

        const words: Array<{ x: number; y: number; str: string }> = []
        for (const raw of content.items as Array<{ str?: string; transform?: number[] }>) {
            const str = raw.str?.trim()
            if (!str || !raw.transform) continue
            const x = (raw.transform[4] - px0) / pageW
            const y = 1 - (raw.transform[5] - py0) / pageH
            if (x < zx0 || x > zx1 || y < zy0 || y > zy1) continue
            words.push({ x, y, str })
        }
        if (words.length === 0) return null

        // Group words into lines by baseline, left-to-right within a line.
        words.sort((a, b) => a.y - b.y || a.x - b.x)
        const lines: string[] = []
        let current: typeof words = []
        for (const word of words) {
            if (current.length > 0 && Math.abs(word.y - current[0].y) > 0.008) {
                lines.push(current.sort((a, b) => a.x - b.x).map(w => w.str).join(' '))
                current = []
            }
            current.push(word)
        }
        if (current.length > 0) {
            lines.push(current.sort((a, b) => a.x - b.x).map(w => w.str).join(' '))
        }

        return parseZoneFields(lines)
    } catch (err) {
        console.error('[LookbookEditor] zone text extraction failed', err)
        return null
    }
}

function parseZoneFields(lines: string[]): ZoneFields | null {
    const out: ZoneFields = {
        sku: null,
        name: null,
        jewelryType: null,
        size: null,
        material: null,
        color: null,
        weight: null,
        replacementCost: null,
        description: null,
    }
    const extras: string[] = []

    for (const line of lines) {
        // A captured line can contain a neighbouring cell's label on the same
        // baseline ("Style: RB-OP-BK001 Style:"), so split it into
        // label→value segments: each value ends at the next label token.
        const tokenRe = /(style|sku|material|colou?r|description|sizes?|accessor\w*|weight|rrp|price)\s*[:：]/gi
        const tokens = [...line.matchAll(tokenRe)]
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i]
            const label = token[1].toLowerCase()
            const start = (token.index ?? 0) + token[0].length
            const end = i + 1 < tokens.length ? tokens[i + 1].index : undefined
            const value = line.slice(start, end).trim()
            if (!value) continue
            if (label === 'style' || label === 'sku') out.sku = out.sku ?? value
            else if (label === 'material') out.material = out.material ?? value
            else if (label === 'colour' || label === 'color') out.color = out.color ?? value
            else if (label === 'description') {
                out.name = out.name ?? value
                out.description = out.description ?? value
                out.jewelryType = out.jewelryType ?? inferJewelryType(value)
            }
            else if (label === 'size' || label === 'sizes') out.size = out.size ?? value
            else if (label === 'weight') out.weight = out.weight ?? value
            else if (label === 'rrp' || label === 'price') {
                const amount = Number(value.replace(/[^0-9.]/g, ''))
                if (Number.isFinite(amount) && amount > 0) out.replacementCost = out.replacementCost ?? amount
            } else {
                extras.push(`${token[1]}: ${value}`) // accessories, …
            }
        }
    }

    // No labelled spec block — fall back to a SKU-shaped token anywhere in the zone.
    if (!out.sku) {
        for (const line of lines) {
            const token = line.split(/\s+/).find(word => /^[A-Z0-9][A-Z0-9-]{4,}$/.test(word))
            if (token) {
                out.sku = token
                break
            }
        }
    }
    if (extras.length > 0) {
        out.description = [out.description, extras.join(' · ')].filter(Boolean).join(' · ')
    }
    // The type usually comes from the Description label; when that label sits
    // outside the captured zone, infer it from whatever text we did capture.
    if (!out.jewelryType) {
        out.jewelryType = inferJewelryType([out.name, out.description, ...lines].filter(Boolean).join(' '))
    }

    const empty = Object.values(out).every(value => value === null)
    return empty ? null : out
}

function inferJewelryType(value: string) {
    const normalized = value.toLowerCase()
    if (/\bearrings?\b/.test(normalized)) return 'Earring'
    if (/\brings?\b/.test(normalized)) return 'Rings'
    if (/\bnecklaces?\b/.test(normalized)) return 'Necklace'
    if (/\bbrooch(?:es)?\b/.test(normalized)) return 'Brooch'
    return null
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
}

// Mirrors ItemForm's deriveDailyRentalFromRrp (weekly rate = 15% of RRP).
function deriveDailyRentalFromRrp(rrp: number) {
    const safeRrp = Number.isFinite(rrp) ? Math.max(0, rrp) : 0
    return Math.round(((safeRrp * 0.15) / 7 + Number.EPSILON) * 100) / 100
}

function getQuickSizesForJewelryType(value: string) {
    const normalized = value.toLowerCase().replace(/\s+/g, '')
    const singular = normalized.endsWith('s') ? normalized.slice(0, -1) : normalized
    if (singular === 'ring') return ['S', 'M']
    if (singular === 'earring') return ['Mini', 'Regular', 'OS']
    return []
}

// Best image for a zone, in order of fidelity: the photo embedded in the PDF
// (native resolution, no surrounding text), then a high-res render of the
// zone, then a crop of the on-screen canvas.
async function getZoneImage(
    doc: import('pdfjs-dist').PDFDocumentProxy | null,
    pageCanvas: HTMLCanvasElement | null,
    pageNumber: number,
    bbox: Bbox,
): Promise<ZoneImage | null> {
    const embedded = await extractEmbeddedZoneImage(doc, pageNumber, bbox)
    if (embedded) return { canvas: embedded, source: 'embedded' }
    const rendered = await renderZoneHighRes(doc, pageNumber, bbox)
    if (rendered) return { canvas: rendered, source: 'render' }
    if (pageCanvas) {
        try {
            return { canvas: cropCanvasRegion(pageCanvas, bbox), source: 'render' }
        } catch {
            // fall through
        }
    }
    return null
}

// Walk the page's operator list tracking the transform stack, find every
// embedded image and where it lands on the page, and return the one whose
// footprint best overlaps the zone — the original photo, not a re-raster.
async function extractEmbeddedZoneImage(
    doc: import('pdfjs-dist').PDFDocumentProxy | null,
    pageNumber: number,
    bbox: Bbox,
): Promise<HTMLCanvasElement | null> {
    if (!doc) return null
    try {
        const { OPS } = await import('pdfjs-dist')
        const page = await doc.getPage(Math.min(pageNumber, doc.numPages))
        const [px0, py0, px1, py1] = page.view
        const pageW = px1 - px0
        const pageH = py1 - py0
        const { fnArray, argsArray } = await page.getOperatorList()

        const stack: number[][] = []
        let ctm = [1, 0, 0, 1, 0, 0]
        let best: { name: string | null; inline: PdfImageLike | null; coverage: number; inter: number } | null = null

        const zone = expandProductZone(bbox)

        const consider = (name: string | null, inline: PdfImageLike | null) => {
            // The image is painted into the unit square under the current
            // transform; project its corners to normalised page coords
            // (top-left origin, like our bboxes).
            const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]]
            const ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]]
            const rect: Bbox = {
                x: (Math.min(...xs) - px0) / pageW,
                y: 1 - (Math.max(...ys) - py0) / pageH,
                w: (Math.max(...xs) - Math.min(...xs)) / pageW,
                h: (Math.max(...ys) - Math.min(...ys)) / pageH,
            }
            const ix = Math.max(0, Math.min(zone.x + zone.w, rect.x + rect.w) - Math.max(zone.x, rect.x))
            const iy = Math.max(0, Math.min(zone.y + zone.h, rect.y + rect.h) - Math.max(zone.y, rect.y))
            const inter = ix * iy
            if (inter <= 0) return
            const imgArea = rect.w * rect.h
            const iou = inter / (imgArea + zone.w * zone.h - inter)
            const coverage = imgArea > 0 ? inter / imgArea : 0
            if (coverage < 0.5 && iou < 0.15) return
            // Prefer the image most contained by the zone: a big hero/model
            // image whose (unclipped) footprint brushes the zone loses to the
            // cell's own product photo, which sits fully inside it.
            if (!best || coverage > best.coverage || (coverage === best.coverage && inter > best.inter)) {
                best = { name, inline, coverage, inter }
            }
        }

        for (let i = 0; i < fnArray.length; i++) {
            const fn = fnArray[i]
            if (fn === OPS.save) {
                stack.push(ctm)
            } else if (fn === OPS.restore) {
                ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
            } else if (fn === OPS.transform) {
                ctm = multiplyMatrix(ctm, argsArray[i] as number[])
            } else if (fn === OPS.paintFormXObjectBegin) {
                stack.push(ctm)
                const matrix = (argsArray[i] as unknown[])[0] as number[] | null
                if (matrix) ctm = multiplyMatrix(ctm, matrix)
            } else if (fn === OPS.paintFormXObjectEnd) {
                ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
            } else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
                consider((argsArray[i] as unknown[])[0] as string, null)
            } else if (fn === OPS.paintInlineImageXObject) {
                consider(null, (argsArray[i] as unknown[])[0] as PdfImageLike)
            }
        }

        if (!best) return null
        const { name, inline } = best as { name: string | null; inline: PdfImageLike | null }
        if (inline) return pdfImageToCanvas(inline)
        if (!name) return null
        // Images reused across pages live in commonObjs under a g_ id; a
        // timeout guards against ids that never resolve.
        const objs = name.startsWith('g_') ? page.commonObjs : page.objs
        const img = await Promise.race([
            new Promise<unknown>(resolve => objs.get(name, resolve)),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
        ])
        return pdfImageToCanvas(img as PdfImageLike | null)
    } catch (err) {
        console.error('[LookbookEditor] embedded image extraction failed', err)
        return null
    }
}

type PdfImageLike = {
    width?: number
    height?: number
    bitmap?: ImageBitmap
    data?: Uint8Array | Uint8ClampedArray
}

function pdfImageToCanvas(img: PdfImageLike | null): HTMLCanvasElement | null {
    if (!img?.width || !img.height) return null
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    if (img.bitmap) {
        ctx.drawImage(img.bitmap, 0, 0)
        return canvas
    }
    if (!img.data) return null
    const pixels = img.width * img.height
    const rgba = new Uint8ClampedArray(pixels * 4)
    if (img.data.length === pixels * 4) {
        rgba.set(img.data)
    } else if (img.data.length === pixels * 3) {
        for (let i = 0, j = 0; i < pixels; i++) {
            rgba[i * 4] = img.data[j++]
            rgba[i * 4 + 1] = img.data[j++]
            rgba[i * 4 + 2] = img.data[j++]
            rgba[i * 4 + 3] = 255
        }
    } else {
        return null // 1bpp grayscale etc. — let the render fallback handle it
    }
    ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0)
    return canvas
}

// Same composition as pdf.js Util.transform: apply m2, then m1.
function multiplyMatrix(m1: number[], m2: number[]) {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ]
}

function expandProductZone(bbox: Bbox): Bbox {
    // SKU boxes often sit under the photo. Search/render the surrounding tile.
    const left = bbox.x - bbox.w * 1.3
    const top = bbox.y - bbox.h * 1.4
    const right = bbox.x + bbox.w * 2.3
    const bottom = bbox.y + bbox.h * 2
    return {
        x: clamp(left, 0, 1),
        y: clamp(top, 0, 1),
        w: clamp(right, 0, 1) - clamp(left, 0, 1),
        h: clamp(bottom, 0, 1) - clamp(top, 0, 1),
    }
}

// Render the product tile around the bbox straight from the PDF, scaled so its
// long edge is ~1200px — the on-screen canvas is only 1.5x page scale and crops
// from it come out tiny and blurry on the storefront.
async function renderZoneHighRes(
    doc: import('pdfjs-dist').PDFDocumentProxy | null,
    pageNumber: number,
    bbox: Bbox,
): Promise<HTMLCanvasElement | null> {
    if (!doc) return null
    try {
        const page = await doc.getPage(Math.min(pageNumber, doc.numPages))
        const base = page.getViewport({ scale: 1 })
        const zone = expandProductZone(bbox)
        const longEdge = Math.max(zone.w * base.width, zone.h * base.height)
        if (longEdge <= 0) return null
        const scale = clamp(1200 / longEdge, 1.5, 8)
        const viewport = page.getViewport({
            scale,
            offsetX: -zone.x * base.width * scale,
            offsetY: -zone.y * base.height * scale,
        })
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.ceil(zone.w * base.width * scale))
        canvas.height = Math.max(1, Math.ceil(zone.h * base.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
        return canvas
    } catch (err) {
        console.error('[LookbookEditor] high-res zone render failed', err)
        return null
    }
}

function fileBaseName(parts: Array<string | null | undefined>) {
    return parts
        .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        .join('-')
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/(^-|-$)+/g, '')
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('failed to encode crop image'))
                return
            }
            resolve(blob)
        }, type)
    })
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}
