'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    AlertCircle,
    ArrowLeft,
    Check,
    ClipboardList,
    FileUp,
    Loader2,
    Pencil,
    Plus,
    RotateCcw,
    Sparkles,
    Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ItemForm } from '@/components/admin/ItemForm'
import type {
    DocumentStructureMap,
    ItemLineType,
    LookbookImportSessionSummary,
    StagingItem,
} from '@/types'
import {
    commitLookbookImportAction,
    getLookbookImportSessionAction,
    saveStructureConfirmationAction,
    startLookbookImportAction,
    updateLookbookDraftItemAction,
} from '@/actions/lookbook-import'

interface Category {
    id: string
    name: string
}

interface CollectionOption {
    id: string
    name: string
}

interface LookbookImportPanelProps {
    categories: Category[]
    collections: CollectionOption[]
    sessions: LookbookImportSessionSummary[]
    onClose: () => void
    initialSessionId?: string | null
}

type LoadedSession = NonNullable<Awaited<ReturnType<typeof getLookbookImportSessionAction>>['session']>
type SectionErrorSummary = {
    section_id: string
    message: string
}

const STEP_TITLES = {
    uploaded: 'Upload PDF',
    parse_failed: 'Parse Failed',
    awaiting_structure_confirmation: 'Confirm Structure',
    processing_drafts: 'Build Drafts',
    awaiting_item_confirmation: 'Review Drafts',
    confirmed_ready_to_import: 'Import Ready',
    imported: 'Imported',
} as const

const parsePageList = (value: string) =>
    value
        .split(',')
        .map(entry => Number.parseInt(entry.trim(), 10))
        .filter(page => Number.isFinite(page) && page > 0)

const stringifyPageList = (pages: number[]) => pages.join(', ')

const getEventReasoningSummary = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null
    }

    const reasoningSummary = (payload as { reasoning_summary?: unknown }).reasoning_summary
    return typeof reasoningSummary === 'string' ? reasoningSummary : null
}

const formatConfidenceLabel = (confidence: string | null | undefined) => {
    if (confidence === 'high') return 'High confidence'
    if (confidence === 'medium') return 'Medium confidence'
    if (confidence === 'low') return 'Low confidence'
    return 'Needs review'
}

const getConfidenceBadgeClassName = (confidence: string | null | undefined) => {
    if (confidence === 'high') {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    }

    if (confidence === 'medium') {
        return 'border-amber-200 bg-amber-50 text-amber-700'
    }

    return 'border-border bg-muted text-foreground'
}

export function LookbookImportPanel({
    categories,
    collections,
    sessions,
    onClose,
    initialSessionId = null,
}: LookbookImportPanelProps) {
    const router = useRouter()
    const [localSessions, setLocalSessions] = useState(sessions)
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId || sessions[0]?.id || null)
    const [session, setSession] = useState<LoadedSession | null>(null)
    const [editableStructure, setEditableStructure] = useState<DocumentStructureMap | null>(null)
    const [coverPagesInput, setCoverPagesInput] = useState('')
    const [appendixPagesInput, setAppendixPagesInput] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [defaultLineType, setDefaultLineType] = useState<ItemLineType>('Mainline')
    const [editingItem, setEditingItem] = useState<StagingItem | null>(null)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        setLocalSessions(sessions)
    }, [sessions])

    const refreshSession = async (sessionId: string) => {
        const result = await getLookbookImportSessionAction(sessionId)
        if (!result.success || !result.session) {
            toast.error(result.error || 'Could not load the lookbook session.')
            return
        }

        setSession(result.session)
        setLocalSessions(prev => {
            const nextEntry = {
                id: result.session.id,
                source_label: result.session.source_label,
                source_storage_path: result.session.source_storage_path,
                created_at: result.session.created_at,
                overall_status: result.session.overall_status as LookbookImportSessionSummary['overall_status'],
                items_total: result.session.items_total || result.session.items.length || 0,
                items_ready: result.session.items_scraped || result.session.items.length || 0,
            }

            return [
                nextEntry,
                ...prev.filter(entry => entry.id !== result.session?.id),
            ]
        })
        setEditableStructure(result.session.structure_map)
        setCoverPagesInput(stringifyPageList(result.session.structure_map.cover_pages || []))
        setAppendixPagesInput(stringifyPageList(result.session.structure_map.appendix_pages || []))
    }

    useEffect(() => {
        if (!selectedSessionId) {
            setSession(null)
            setEditableStructure(null)
            return
        }

        void refreshSession(selectedSessionId)
    }, [selectedSessionId])

    const activeItems = useMemo(() => {
        return (session?.items || []).filter(item => item.status !== 'imported')
    }, [session])

    const visibleItems = useMemo(() => {
        return activeItems.filter(item => item.status !== 'rejected')
    }, [activeItems])

    const rejectedItems = useMemo(() => {
        return activeItems.filter(item => item.status === 'rejected')
    }, [activeItems])

    const sectionErrors = useMemo(() => {
        const rawSectionErrors = (session?.confirmation_snapshot as { section_errors?: unknown } | undefined)?.section_errors
        return Array.isArray(rawSectionErrors) ? rawSectionErrors as SectionErrorSummary[] : []
    }, [session])

    const currentStepLabel = session ? STEP_TITLES[session.overall_status as keyof typeof STEP_TITLES] : STEP_TITLES.uploaded

    const structureReviewState = useMemo(() => {
        if (!session || !editableStructure) {
            return null
        }

        const structureEvent = [...(session.events || [])]
            .reverse()
            .find(event =>
                event.step === 'structure_map' ||
                (event.step === 'error' && `${event.message || ''} ${getEventReasoningSummary(event.payload) || ''}`.toLowerCase().includes('structure'))
            )
        const eventMessage = structureEvent?.message?.trim() || null
        const reasoningSummary = getEventReasoningSummary(structureEvent?.payload)
        const normalizedMessage = `${eventMessage || ''} ${reasoningSummary || ''}`.toLowerCase()
        const hasFallbackSignal =
            normalizedMessage.includes('fallback') ||
            normalizedMessage.includes('manual structure') ||
            normalizedMessage.includes('unavailable')

        if (hasFallbackSignal) {
            return {
                tone: 'warning' as const,
                title: 'Manual structure confirmation required',
                description: 'Automatic structure detection was unavailable or incomplete. Review the page ranges below before draft extraction continues.',
            }
        }

        if (editableStructure.confidence === 'low') {
            return {
                tone: 'warning' as const,
                title: 'Low-confidence structure detected',
                description: 'The detected sections need a quick manual review before drafts are generated.',
            }
        }

        return {
            tone: 'neutral' as const,
            title: 'Review the detected structure',
            description: 'Check the series names, page ranges, and supporting pages, then confirm the structure to continue.',
        }
    }, [editableStructure, session])

    const handleStartImport = () => {
        if (!file) {
            toast.error('Choose a PDF file first.')
            return
        }

        startTransition(async () => {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('defaultLineType', defaultLineType)
            const result = await startLookbookImportAction(formData)

            if (!result.sessionId) {
                toast.error(result.error || 'Could not start the lookbook import.')
                return
            }

            setLocalSessions(prev => [
                {
                    id: result.sessionId,
                    source_label: file.name,
                    source_storage_path: null,
                    created_at: new Date().toISOString(),
                    overall_status: result.success ? 'awaiting_structure_confirmation' : 'parse_failed',
                    items_total: 0,
                    items_ready: 0,
                },
                ...prev.filter(entry => entry.id !== result.sessionId),
            ])
            setSelectedSessionId(result.sessionId)
            router.refresh()
            if (!result.success) {
                toast.error(result.error || 'The PDF upload was saved, but parsing failed.')
                return
            }

            setFile(null)
            toast.success('Lookbook uploaded. Review the structure map next.')
        })
    }

    const handleSaveStructure = () => {
        if (!session || !editableStructure) return

        startTransition(async () => {
            const structureMap: DocumentStructureMap = {
                ...editableStructure,
                cover_pages: parsePageList(coverPagesInput),
                appendix_pages: parsePageList(appendixPagesInput),
            }

            const result = await saveStructureConfirmationAction({
                sessionId: session.id,
                structureMap,
            })

            if (!result.success) {
                toast.error(result.error || 'Could not save structure confirmation.')
                return
            }

            await refreshSession(session.id)
            router.refresh()
            toast.success('Structure confirmed. Draft extraction is ready for review.')
        })
    }

    const handleToggleItemStatus = (item: StagingItem) => {
        startTransition(async () => {
            const nextStatus = item.status === 'rejected' ? 'pending_review' : 'rejected'
            const result = await updateLookbookDraftItemAction({
                itemId: item.id,
                updates: { status: nextStatus },
                reason: nextStatus === 'rejected' ? 'manual_item_skip' : 'manual_item_restore',
            })

            if (!result.success) {
                toast.error(result.error || 'Could not update the draft item.')
                return
            }

            if (selectedSessionId) {
                await refreshSession(selectedSessionId)
            }
        })
    }

    const handleCommit = () => {
        if (!session) return

        startTransition(async () => {
            const result = await commitLookbookImportAction(session.id)
            if (!result.success) {
                toast.error(result.error || 'Could not import confirmed items.')
                return
            }

            await refreshSession(session.id)
            router.refresh()
            toast.success(`Imported ${result.importedCount} item(s) into inventory.`)
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <Sparkles className="h-5 w-5 text-foreground" />
                        Lookbook Import
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Upload a lookbook PDF, confirm the structure map, review draft items, then import.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-foreground">Import Sessions</h3>
                            <p className="text-xs text-muted-foreground">Current and recent PDF imports.</p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setSelectedSessionId(null)
                                setSession(null)
                                setEditableStructure(null)
                            }}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            New
                        </Button>
                    </div>

                    <div className="space-y-2">
                        {localSessions.length === 0 && (
                            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                No lookbook sessions yet.
                            </div>
                        )}

                        {localSessions.map(entry => (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => setSelectedSessionId(entry.id)}
                                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                                    selectedSessionId === entry.id
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border bg-card text-foreground'
                                }`}
                            >
                                <div className="truncate font-medium">{entry.source_label || 'Imported PDF'}</div>
                                <div className="mt-2 flex items-center gap-2 text-xs opacity-80">
                                    <span>{STEP_TITLES[entry.overall_status as keyof typeof STEP_TITLES] || entry.overall_status}</span>
                                    <span>{entry.items_total} items</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </aside>

                <section className="space-y-6">
                    <div className="rounded-2xl border bg-card p-6 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <Badge variant="outline" className="border-border text-foreground">
                                {currentStepLabel}
                            </Badge>
                            {session && (
                                <Badge variant="outline" className="border-border text-foreground">
                                    {session.source_label || 'Imported PDF'}
                                </Badge>
                            )}
                        </div>
                    </div>

                    {!session && (
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                            <div className="rounded-2xl border bg-card p-6 shadow-sm">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="lookbook-file">Lookbook PDF</Label>
                                        <Input
                                            id="lookbook-file"
                                            type="file"
                                            accept="application/pdf"
                                            onChange={(event) => setFile(event.target.files?.[0] || null)}
                                            disabled={isPending}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="default-line-type">Default Line Type</Label>
                                        <select
                                            id="default-line-type"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={defaultLineType}
                                            onChange={(event) => setDefaultLineType(event.target.value as ItemLineType)}
                                        >
                                            <option value="Mainline">Mainline</option>
                                            <option value="Collaboration">Collaboration</option>
                                            <option value="Archive">Archive</option>
                                        </select>
                                    </div>

                                    <Button onClick={handleStartImport} disabled={isPending || !file}>
                                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                                        Upload And Parse PDF
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-2xl border bg-muted/50 p-6 shadow-sm">
                                <h3 className="text-sm font-semibold text-foreground">New Flow</h3>
                                <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                                    <p>1. Upload the lookbook PDF.</p>
                                    <p>2. Confirm or correct the structure map.</p>
                                    <p>3. Review extracted items and corrections.</p>
                                    <p>4. Import the confirmed drafts to inventory.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {session && session.overall_status === 'awaiting_structure_confirmation' && editableStructure && (
                        <div className="space-y-6">
                            <div className="rounded-2xl border bg-card p-6 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div className="space-y-3">
                                        <div>
                                            <h3 className="text-base font-semibold text-foreground">Structure Confirmation</h3>
                                            <p className="mt-1 text-sm text-muted-foreground">
                                                Confirm the series layout before draft extraction begins.
                                            </p>
                                        </div>

                                        {structureReviewState && (
                                            <div
                                                className={`max-w-2xl rounded-xl border px-4 py-3 text-sm ${
                                                    structureReviewState.tone === 'warning'
                                                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                                                        : 'border-border bg-muted/50 text-foreground'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 font-medium">
                                                    <AlertCircle className="h-4 w-4" />
                                                    {structureReviewState.title}
                                                </div>
                                                <p className="mt-2 text-sm">
                                                    {structureReviewState.description}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <Button onClick={handleSaveStructure} disabled={isPending}>
                                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Confirm Structure
                                    </Button>
                                </div>

                                <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                                    <div className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Cover Pages</Label>
                                                <Input value={coverPagesInput} onChange={(event) => setCoverPagesInput(event.target.value)} placeholder="1, 2" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Appendix Pages</Label>
                                                <Input value={appendixPagesInput} onChange={(event) => setAppendixPagesInput(event.target.value)} placeholder="48, 49, 50" />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {editableStructure.series_sections.map((section, index) => (
                                                <div key={section.id} className="rounded-2xl border border-border p-4">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold text-foreground">Series {index + 1}</div>
                                                            <div className="mt-1 text-sm text-muted-foreground">
                                                                Pages {section.start_page}-{section.end_page} • Estimated {section.estimated_item_count} item{section.estimated_item_count === 1 ? '' : 's'}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge
                                                                variant="outline"
                                                                className={getConfidenceBadgeClassName(section.confidence)}
                                                            >
                                                                {formatConfidenceLabel(section.confidence)}
                                                            </Badge>
                                                            <Button
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setEditableStructure({
                                                                        ...editableStructure,
                                                                        series_sections: editableStructure.series_sections.filter((_, sectionIndex) => sectionIndex !== index),
                                                                    })
                                                                }}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                                        <div className="space-y-2">
                                                            <Label>Series Name</Label>
                                                            <Input
                                                                value={section.detected_name}
                                                                onChange={(event) => {
                                                                    const nextSections = [...editableStructure.series_sections]
                                                                    nextSections[index] = { ...section, detected_name: event.target.value }
                                                                    setEditableStructure({ ...editableStructure, series_sections: nextSections })
                                                                }}
                                                                placeholder="Spring Collection"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>Collection Name</Label>
                                                            <Input
                                                                value={section.collection_name || ''}
                                                                onChange={(event) => {
                                                                    const nextSections = [...editableStructure.series_sections]
                                                                    nextSections[index] = { ...section, collection_name: event.target.value, collection_id: null }
                                                                    setEditableStructure({ ...editableStructure, series_sections: nextSections })
                                                                }}
                                                                placeholder="Existing or new collection"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>Start Page</Label>
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                value={section.start_page}
                                                                onChange={(event) => {
                                                                    const nextSections = [...editableStructure.series_sections]
                                                                    nextSections[index] = { ...section, start_page: Number(event.target.value) || 1 }
                                                                    setEditableStructure({ ...editableStructure, series_sections: nextSections })
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label>End Page</Label>
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                value={section.end_page}
                                                                onChange={(event) => {
                                                                    const nextSections = [...editableStructure.series_sections]
                                                                    nextSections[index] = { ...section, end_page: Number(event.target.value) || 1 }
                                                                    setEditableStructure({ ...editableStructure, series_sections: nextSections })
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="space-y-2 md:col-span-2">
                                                            <Label>Estimated Items</Label>
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                value={section.estimated_item_count}
                                                                onChange={(event) => {
                                                                    const nextSections = [...editableStructure.series_sections]
                                                                    nextSections[index] = { ...section, estimated_item_count: Number(event.target.value) || 0 }
                                                                    setEditableStructure({ ...editableStructure, series_sections: nextSections })
                                                                }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 rounded-xl bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
                                                        {section.reasoning_summary || 'No reasoning summary was recorded for this section.'}
                                                    </div>
                                                </div>
                                            ))}

                                            <Button
                                                variant="outline"
                                                onClick={() => setEditableStructure({
                                                    ...editableStructure,
                                                    series_sections: [
                                                        ...editableStructure.series_sections,
                                                        {
                                                            id: `section-${editableStructure.series_sections.length + 1}`,
                                                            detected_name: `Series ${editableStructure.series_sections.length + 1}`,
                                                            start_page: 1,
                                                            end_page: 1,
                                                            estimated_item_count: 0,
                                                            confidence: 'low',
                                                            reasoning_summary: 'Manually added series section.',
                                                            evidence_pages: [],
                                                            collection_name: '',
                                                            collection_id: null,
                                                        },
                                                    ],
                                                })}
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Add Series Section
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="rounded-2xl border border-border bg-muted/50 p-4">
                                            <h4 className="text-sm font-semibold text-foreground">What To Review</h4>
                                            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                                <p>Confirm the cover and appendix pages so extraction skips non-product content.</p>
                                                <p>Adjust each series page range if a divider page or weak heading was grouped incorrectly.</p>
                                                <p>Map each detected series to an existing collection or enter a new collection name.</p>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-border bg-card p-4">
                                            <h4 className="text-sm font-semibold text-foreground">Current Structure</h4>
                                            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                                                <div className="rounded-xl bg-muted/50 px-3 py-3">
                                                    <div className="font-medium text-foreground">Cover Pages</div>
                                                    <div className="mt-1">
                                                        {parsePageList(coverPagesInput).length > 0 ? stringifyPageList(parsePageList(coverPagesInput)) : 'None selected'}
                                                    </div>
                                                </div>
                                                <div className="rounded-xl bg-muted/50 px-3 py-3">
                                                    <div className="font-medium text-foreground">Appendix Pages</div>
                                                    <div className="mt-1">
                                                        {parsePageList(appendixPagesInput).length > 0 ? stringifyPageList(parsePageList(appendixPagesInput)) : 'None selected'}
                                                    </div>
                                                </div>
                                                <div className="rounded-xl bg-muted/50 px-3 py-3">
                                                    <div className="font-medium text-foreground">Series Sections</div>
                                                    <div className="mt-1">
                                                        {editableStructure.series_sections.length} section{editableStructure.series_sections.length === 1 ? '' : 's'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {session && session.overall_status === 'processing_drafts' && (
                        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                            <p className="mt-4 text-sm text-muted-foreground">Draft extraction is running. Refresh in a moment if this takes longer than expected.</p>
                        </div>
                    )}

                    {session && ['awaiting_item_confirmation', 'confirmed_ready_to_import', 'imported'].includes(session.overall_status) && (
                        <div className="space-y-6">
                            <div className="rounded-2xl border bg-card p-6 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-foreground">Draft Review</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Review extracted items, make corrections, skip anything you do not want to import, then confirm.
                                        </p>
                                    </div>
                                    <Button onClick={handleCommit} disabled={isPending || visibleItems.length === 0 || session.overall_status === 'imported'}>
                                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                        {session.overall_status === 'imported' ? 'Already Imported' : `Confirm And Import (${visibleItems.length})`}
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-2xl border bg-card p-6 shadow-sm">
                                <div className="space-y-3">
                                    {sectionErrors.length > 0 && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                            <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                                                <AlertCircle className="h-4 w-4" />
                                                Series needing manual review
                                            </div>
                                            <div className="mt-3 space-y-2">
                                                {sectionErrors.map((entry) => (
                                                    <div key={entry.section_id} className="rounded-lg border border-amber-200 bg-card px-3 py-2 text-sm text-foreground">
                                                        <div className="font-medium">{entry.section_id}</div>
                                                        <div className="mt-1 text-muted-foreground">{entry.message}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {visibleItems.length === 0 && (
                                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                            No active draft items remain in this session.
                                        </div>
                                    )}

                                    {visibleItems.map(item => {
                                        const issues = Array.isArray(item.import_metadata?.issues) ? item.import_metadata.issues : []
                                        return (
                                            <div key={item.id} className="rounded-xl border border-border p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                    <div className="flex gap-4">
                                                        {item.image_urls?.[0] ? (
                                                            <img
                                                                src={item.image_urls[0]}
                                                                alt={item.name}
                                                                className="h-16 w-16 rounded-lg object-cover border border-border bg-muted/50"
                                                            />
                                                        ) : (
                                                            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/70">
                                                                <AlertCircle className="h-4 w-4" />
                                                            </div>
                                                        )}

                                                        <div>
                                                            <div className="font-medium text-foreground">{item.name}</div>
                                                            <div className="mt-1 text-sm text-muted-foreground">
                                                                SKU {item.sku || 'missing'} • Page {item.source_page || '-'} • {item.collection_id ? 'Series mapped' : 'Series missing'}
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {issues.map(issue => (
                                                                    <Badge key={issue} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                                                        {issue}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <Button variant="outline" onClick={() => setEditingItem(item)}>
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Edit
                                                        </Button>
                                                        <Button variant="outline" onClick={() => handleToggleItemStatus(item)}>
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Skip
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {rejectedItems.length > 0 && (
                                    <div className="mt-6 border-t pt-6">
                                        <h4 className="text-sm font-semibold text-foreground">Skipped Items</h4>
                                        <div className="mt-3 space-y-2">
                                            {rejectedItems.map(item => (
                                                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                                                    <div>
                                                        <div className="font-medium text-foreground">{item.name}</div>
                                                        <div className="text-xs text-muted-foreground">{item.sku || 'No SKU'}</div>
                                                    </div>
                                                    <Button variant="outline" onClick={() => handleToggleItemStatus(item)}>
                                                        <RotateCcw className="mr-2 h-4 w-4" />
                                                        Restore
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-6 xl:grid-cols-2">
                                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                                    <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                                        <ClipboardList className="h-4 w-4" />
                                        Correction Summary
                                    </h3>
                                    <div className="mt-4 space-y-2">
                                        {session.correction_summary?.length ? session.correction_summary.map((entry: { scope: string; field_name: string; count: number }) => (
                                            <div key={`${entry.scope}:${entry.field_name}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                                                <span>{entry.scope} / {entry.field_name}</span>
                                                <Badge variant="outline">{entry.count}</Badge>
                                            </div>
                                        )) : (
                                            <p className="text-sm text-muted-foreground">No manual corrections recorded yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                                    <h3 className="text-base font-semibold text-foreground">Event Log</h3>
                                    <div className="mt-4 space-y-2">
                                        {session.events?.map(event => {
                                            const reasoningSummary = getEventReasoningSummary(event.payload)
                                            return (
                                                <div key={event.id} className="rounded-lg border border-border px-3 py-2">
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Badge variant="outline">{event.step}</Badge>
                                                        <span>{event.level}</span>
                                                    </div>
                                                    <div className="mt-1 text-sm text-foreground">{event.message}</div>
                                                    {reasoningSummary && (
                                                        <div className="mt-2 text-xs text-muted-foreground">
                                                            {reasoningSummary}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {session && session.overall_status === 'parse_failed' && (
                        <div className="rounded-2xl border bg-card p-6 shadow-sm">
                            <div className="flex items-start gap-3 text-sm text-muted-foreground">
                                <AlertCircle className="mt-0.5 h-4 w-4 text-red-500" />
                                <div>
                                    <div className="font-medium text-foreground">Parsing failed for this session.</div>
                                    <div className="mt-1">Start a new import session with another PDF or retry the current file.</div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
                <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle>Edit Draft Item</DialogTitle>
                    </DialogHeader>

                    {editingItem && (
                        <ItemForm
                            mode="edit"
                            isStaging
                            item={undefined}
                            initialData={{
                                sku: editingItem.sku || '',
                                name: editingItem.name || '',
                                description: editingItem.description || '',
                                line_type: editingItem.line_type as ItemLineType,
                                character_family: editingItem.character_family,
                                category_id: editingItem.category_id || '',
                                collection_id: editingItem.collection_id || '',
                                material: editingItem.material || '',
                                weight: editingItem.weight || '',
                                color: editingItem.color || '',
                                rental_price: editingItem.rental_price || 0,
                                replacement_cost: editingItem.replacement_cost || 0,
                                status: 'active',
                                image_paths: editingItem.image_urls || [],
                            }}
                            categories={categories}
                            collections={collections}
                            onCancel={() => setEditingItem(null)}
                            onSubmitOverride={async (data) => {
                                const result = await updateLookbookDraftItemAction({
                                    itemId: editingItem.id,
                                    updates: {
                                        sku: data.sku,
                                        name: data.name,
                                        description: data.description || null,
                                        line_type: data.line_type,
                                        character_family: data.character_family,
                                        category_id: data.category_id || null,
                                        collection_id: data.collection_id || null,
                                        material: data.material || null,
                                        weight: data.weight || null,
                                        color: data.color || null,
                                        rental_price: data.rental_price,
                                        replacement_cost: data.replacement_cost,
                                        image_urls: data.image_paths,
                                    },
                                    reason: 'manual_item_edit',
                                })

                                if (!result.success) {
                                    return { success: false, error: result.error || 'Could not save draft item' }
                                }

                                if (selectedSessionId) {
                                    await refreshSession(selectedSessionId)
                                }
                                setEditingItem(null)
                                return { success: true }
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
