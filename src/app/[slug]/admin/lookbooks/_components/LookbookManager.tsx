'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronDown, ExternalLink, FileText, PenSquare } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LookbookCoverage } from '@/lib/lookbook/coverage'

const STATUS_LABEL: Record<string, string> = {
    draft: 'Draft',
    reviewing: 'Reviewing',
    published: 'Published',
}

function pct(part: number, total: number): number {
    return total > 0 ? (part / total) * 100 : 0
}

export function LookbookManager({
    orgSlug,
    coverage,
}: {
    orgSlug: string
    coverage: LookbookCoverage[]
}) {
    if (coverage.length === 0) {
        return (
            <div className="rounded-md border border-border bg-muted/50 p-6 text-sm text-muted-foreground">
                No lookbooks yet. Run{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    npx tsx scripts/lookbook-ingest.ts
                </code>{' '}
                to ingest your first PDF.
            </div>
        )
    }

    return (
        <ul className="space-y-3">
            {coverage.map(lb => (
                <li key={lb.id}>
                    <LookbookCard orgSlug={orgSlug} lb={lb} />
                </li>
            ))}
        </ul>
    )
}

function LookbookCard({ orgSlug, lb }: { orgSlug: string; lb: LookbookCoverage }) {
    const [expanded, setExpanded] = useState(false)
    const editorHref = `/${orgSlug}/admin/lookbooks/${lb.id}/editor`

    const matchedPct = pct(lb.matched, lb.total)
    const reviewPct = pct(lb.needsReview, lb.total)
    const noMatchPct = pct(lb.rejectedNoMatch, lb.total)
    const coverageLabel = lb.coveragePct !== null ? `${Math.round(lb.coveragePct * 100)}% matched` : 'No candidates yet'

    return (
        <div className="rounded-md border border-border bg-card">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <p className="truncate text-sm font-medium text-foreground">{lb.title}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {lb.pageCount} pages · {STATUS_LABEL[lb.editorStatus] ?? lb.editorStatus}
                        {lb.published ? ' · Live' : ''}
                    </p>

                    {/* Coverage bar */}
                    <div className="mt-3 max-w-md">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground">{coverageLabel}</span>
                            <span>{lb.matchedItems} inventory items</span>
                        </div>
                        <div
                            className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-muted"
                            role="img"
                            aria-label={`${lb.matched} matched, ${lb.needsReview} need review, ${lb.rejectedNoMatch} no match of ${lb.total} candidates`}
                        >
                            <div className="bg-emerald-500" style={{ width: `${matchedPct}%` }} />
                            <div className="bg-amber-500" style={{ width: `${reviewPct}%` }} />
                            <div className="bg-slate-400" style={{ width: `${noMatchPct}%` }} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <Legend dot="bg-emerald-500" label={`${lb.matched} matched`} />
                            <Legend dot="bg-amber-500" label={`${lb.needsReview} need review`} />
                            <Legend dot="bg-slate-400" label={`${lb.rejectedNoMatch} no match`} />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                    {lb.published && (
                        <Button asChild variant="outline" size="sm">
                            <Link href={`/${orgSlug}/lookbook/${lb.slug}`} target="_blank">
                                <ExternalLink className="h-3.5 w-3.5" />
                                View Live
                            </Link>
                        </Button>
                    )}
                    <Button asChild size="sm">
                        <Link href={editorHref}>
                            <PenSquare className="h-3.5 w-3.5" />
                            Open Editor
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Drill-down: candidates that don't yet line up with inventory */}
            {lb.unresolved.length > 0 && (
                <div className="border-t border-border">
                    <button
                        type="button"
                        onClick={() => setExpanded(v => !v)}
                        aria-expanded={expanded}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <span>
                            {lb.unresolved.length} item{lb.unresolved.length === 1 ? '' : 's'} not matched to your database
                        </span>
                        <ChevronDown
                            className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                            aria-hidden="true"
                        />
                    </button>
                    {expanded && (
                        <ul className="divide-y divide-border border-t border-border">
                            {lb.unresolved.map(item => {
                                const evidence = item.visibleText || item.visualDescription
                                const isReview = item.status === 'needs_review'
                                return (
                                    <li key={item.id}>
                                        <Link
                                            href={`${editorHref}?page=${item.page}`}
                                            className="flex items-center gap-3 px-4 py-2 text-xs transition-colors hover:bg-muted/40"
                                        >
                                            <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                                                p.{item.page}
                                            </span>
                                            <span
                                                className={cn(
                                                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                                                    isReview
                                                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                        : 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
                                                )}
                                            >
                                                {isReview ? 'Needs review' : 'No match'}
                                            </span>
                                            <span className="truncate text-muted-foreground">
                                                {evidence ?? 'No extracted text'}
                                            </span>
                                            <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        </Link>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}

function Legend({ dot, label }: { dot: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
            {label}
        </span>
    )
}
