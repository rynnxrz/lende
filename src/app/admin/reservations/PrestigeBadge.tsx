'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { runPrestigeAnalysisAction, type RunPrestigeResult } from './run-prestige-action'
import type { PersistedPrestige } from '@/lib/reservations/prestige-agent'

type Tier = PersistedPrestige['tier']

function tierClass(tier: Tier, confidence: PersistedPrestige['confidence']): string {
    const base = 'border'
    const dim = confidence === 'low' ? ' opacity-70' : ''
    switch (tier) {
        case 'iconic':
            return `${base} border-amber-300 bg-amber-50 text-amber-900${dim}`
        case 'red_carpet':
            return `${base} border-rose-300 bg-rose-50 text-rose-900${dim}`
        case 'editorial':
            return `${base} border-violet-300 bg-violet-50 text-violet-900${dim}`
        case 'standard':
            return `${base} border-input bg-muted/50 text-foreground${dim}`
        case 'unknown':
        default:
            return `${base} border-border bg-card text-muted-foreground/70${dim}`
    }
}

function tierLabel(tier: Tier): string {
    switch (tier) {
        case 'iconic':
            return 'ICONIC'
        case 'red_carpet':
            return 'RED CARPET'
        case 'editorial':
            return 'EDITORIAL'
        case 'standard':
            return 'STANDARD'
        case 'unknown':
        default:
            return 'UNKNOWN'
    }
}

function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso)
        if (isNaN(d.getTime())) return iso
        return d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return iso
    }
}

export function PrestigeBadge({
    prestige,
    groupKey,
    primaryReservationId,
}: {
    prestige: PersistedPrestige | null
    groupKey: string
    primaryReservationId: string
}) {
    const [isPending, startTransition] = useTransition()
    const [open, setOpen] = useState(false)
    const [current, setCurrent] = useState<PersistedPrestige | null>(prestige)
    const [error, setError] = useState<string | null>(null)

    const handleRun = () => {
        setError(null)
        startTransition(async () => {
            const result: RunPrestigeResult = await runPrestigeAnalysisAction(
                groupKey,
                primaryReservationId
            )
            if (result.ok) {
                setCurrent(result.prestige)
                setOpen(true)
            } else {
                setError(result.error)
                setOpen(true)
            }
        })
    }

    if (!current) {
        return (
            <div className="flex flex-col gap-1">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    disabled={isPending}
                    onClick={handleRun}
                >
                    {isPending ? 'Researching…' : 'Run analysis'}
                </Button>
                {error && (
                    <span className="text-[10px] text-rose-600">{error}</span>
                )}
            </div>
        )
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="inline-flex flex-col items-start gap-1 text-left hover:opacity-90 transition-opacity"
                >
                    <Badge variant="outline" className={tierClass(current.tier, current.confidence)}>
                        {tierLabel(current.tier)} · {current.prestige_score}
                        {current.confidence === 'low' && <span className="ml-1">?</span>}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/70">
                        {formatTimestamp(current.generated_at)}
                    </span>
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <Badge variant="outline" className={tierClass(current.tier, current.confidence)}>
                            {tierLabel(current.tier)}
                        </Badge>
                        <span className="text-xl">Score {current.prestige_score} / 100</span>
                        <span className="text-xs text-muted-foreground font-normal">
                            confidence: {current.confidence}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    <SignalCard
                        label="Client"
                        primary={current.client_signal.identity || '(unknown)'}
                        meta={current.client_signal.tier_guess}
                        rationale={current.client_signal.rationale}
                    />
                    <SignalCard
                        label="Celebrity"
                        primary={current.celebrity_signal.name || '(unknown)'}
                        meta={`reach: ${current.celebrity_signal.reach_estimate}`}
                        rationale={current.celebrity_signal.rationale}
                    />
                    <SignalCard
                        label="Event"
                        primary={current.event_signal.name || '(unknown)'}
                        meta={`${current.event_signal.type} · ${current.event_signal.prestige}`}
                        rationale={current.event_signal.rationale}
                    />

                    <div className="border-t border-border pt-3">
                        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                            Citations
                        </h4>
                        {current.citations.length === 0 ? (
                            <p className="text-xs text-muted-foreground/70 italic">No citations.</p>
                        ) : (
                            <ul className="space-y-1">
                                {current.citations.map((c, i) => (
                                    <li key={`${c.url}-${i}`} className="text-xs">
                                        <a
                                            href={c.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                        >
                                            {c.title || c.url}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-[11px] text-muted-foreground/70">
                            Generated {formatTimestamp(current.generated_at)} · schema {current.schema_version}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={handleRun}
                        >
                            {isPending ? 'Re-running…' : 'Re-run analysis'}
                        </Button>
                    </div>

                    {error && (
                        <p className="text-xs text-rose-600">{error}</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function SignalCard({
    label,
    primary,
    meta,
    rationale,
}: {
    label: string
    primary: string
    meta: string
    rationale: string
}) {
    return (
        <div className="rounded-md border border-border p-3">
            <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                </h4>
                <span className="text-[11px] text-muted-foreground/70">{meta}</span>
            </div>
            <p className="text-sm font-medium text-foreground mt-1">{primary}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{rationale}</p>
        </div>
    )
}
