'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { ExternalLink, FileText, Minus, Package } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { BboxCrop } from '@/components/lookbook/BboxCrop'
import type { LookbookMatch } from '@/lib/lookbook/item-matches'

interface LookbookMatchCellProps {
    matches: LookbookMatch[]
    itemImageUrl: string | null
    itemName: string
    basePath?: string
}

function statusDotClass(status: LookbookMatch['status']) {
    if (status === 'confirmed') return 'bg-emerald-500'
    if (status === 'auto_matched') return 'bg-amber-500'
    return 'bg-slate-400'
}

function statusLabel(status: LookbookMatch['status']) {
    if (status === 'confirmed') return 'Confirmed'
    if (status === 'auto_matched') return 'Auto-matched'
    if (status === 'needs_review') return 'Needs review'
    return 'Rejected'
}

function editorStatusLabel(status: LookbookMatch['lookbookEditorStatus']) {
    if (status === 'published') return 'published'
    if (status === 'reviewing') return 'reviewing'
    return 'draft'
}

function SideBySide({
    match,
    itemImageUrl,
    itemName,
    basePath,
}: {
    match: LookbookMatch
    itemImageUrl: string | null
    itemName: string
    basePath: string
}) {
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <div className="relative aspect-square overflow-hidden rounded border border-border bg-muted">
                    {itemImageUrl ? (
                        <Image
                            src={itemImageUrl}
                            alt={itemName}
                            fill
                            sizes="220px"
                            className="object-cover"
                            unoptimized
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[10px] font-medium text-foreground">Item</span>
                </div>
                <div className="relative aspect-square overflow-hidden rounded border border-border">
                    {match.bbox && match.pageImageUrl ? (
                        <BboxCrop
                            pageImageUrl={match.pageImageUrl}
                            bbox={match.bbox}
                            className="h-full w-full"
                            alt={`Lookbook crop for ${itemName}`}
                            loading="eager"
                        />
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted p-2 text-center">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <span className="text-[10px] leading-tight text-muted-foreground">
                                {match.bbox ? 'Page preview not generated' : 'Bbox not yet drawn'}
                            </span>
                        </div>
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1 text-[10px] font-medium text-foreground">PDF</span>
                </div>
            </div>
            <div className="space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(match.status)}`} />
                    <span className="font-medium text-foreground">{match.lookbookTitle}</span>
                    <span className="text-muted-foreground">· p.{match.page}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                    {statusLabel(match.status)}
                    {match.confidence !== null && ` · ${Math.round(match.confidence * 100)}% confidence`}
                    {` · ${editorStatusLabel(match.lookbookEditorStatus)}`}
                </div>
                {(match.visualDescription || match.visibleText) && (
                    <details className="mt-1">
                        <summary className="cursor-pointer select-none text-[10px] text-muted-foreground hover:text-foreground">
                            Evidence
                        </summary>
                        <div className="mt-1 space-y-1 rounded border border-border bg-muted/40 p-2 text-[10px] text-muted-foreground">
                            {match.visualDescription && (
                                <p>
                                    <span className="font-medium text-foreground">AI:</span> {match.visualDescription}
                                </p>
                            )}
                            {match.visibleText && (
                                <p>
                                    <span className="font-medium text-foreground">OCR:</span> {match.visibleText}
                                </p>
                            )}
                        </div>
                    </details>
                )}
                <Link
                    href={`${basePath}/lookbooks/${match.lookbookId}/editor?page=${match.page}`}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                >
                    Open in lookbook editor
                    <ExternalLink className="h-3 w-3" />
                </Link>
            </div>
        </div>
    )
}

export function LookbookMatchCell({
    matches,
    itemImageUrl,
    itemName,
    basePath = '/admin',
}: LookbookMatchCellProps) {
    const [open, setOpen] = useState(false)

    if (matches.length === 0) {
        return (
            <div className="flex h-8 w-8 items-center justify-center text-muted-foreground/40">
                <Minus className="h-3.5 w-3.5" />
            </div>
        )
    }

    const primary = matches[0]
    const extraCount = matches.length - 1

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="relative h-8 w-8 overflow-hidden rounded border border-border bg-muted hover:ring-2 hover:ring-ring focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Lookbook match for ${itemName}`}
                >
                    {primary.bbox && primary.pageImageUrl ? (
                        <BboxCrop
                            pageImageUrl={primary.pageImageUrl}
                            bbox={primary.bbox}
                            className="h-full w-full"
                            alt=""
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                    )}
                    <span
                        className={`absolute right-0 top-0 h-2 w-2 rounded-bl-sm ${statusDotClass(primary.status)}`}
                        title={statusLabel(primary.status)}
                    />
                    {extraCount > 0 && (
                        <span className="absolute bottom-0 right-0 rounded-tl-sm bg-foreground/90 px-1 text-[8px] font-bold leading-tight text-background">
                            +{extraCount}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="center"
                sideOffset={6}
                className="w-[280px] space-y-3 p-3"
            >
                <SideBySide
                    match={primary}
                    itemImageUrl={itemImageUrl}
                    itemName={itemName}
                    basePath={basePath}
                />
                {matches.length > 1 && (
                    <div className="space-y-3 border-t border-border pt-3">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Also appears in
                        </div>
                        {matches.slice(1).map(m => (
                            <SideBySide
                                key={m.matchId}
                                match={m}
                                itemImageUrl={itemImageUrl}
                                itemName={itemName}
                                basePath={basePath}
                            />
                        ))}
                    </div>
                )}
                {primary.status === 'auto_matched' && (
                    <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-900 dark:text-amber-200">
                        AI matched this — open the editor to confirm.
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}

export type { LookbookMatch } from '@/lib/lookbook/item-matches'
