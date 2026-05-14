'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    Plus,
    Mail,
    CalendarPlus,
    CheckCircle2,
    XCircle,
    Flame,
    Snowflake,
    Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { systemCreateOrgAction } from '@/app/actions/invitations/system-create-org'
import {
    extendTrialAction,
    convertToPaidAction,
    deactivateOrgAction,
    sendPersonalEmailAction,
} from './actions'

export interface Org {
    id: string
    slug: string
    name: string
    plan: string | null
    trialEndsAt: string | null
    subscriptionStatus: string | null
    subscriptionId: string | null
    createdAt: string
}

export interface TrialOrg {
    id: string
    slug: string
    name: string
    plan: string | null
    trialEndsAt: string | null
    subscriptionStatus: string | null
    createdAt: string
    engagementScore: number
    itemsCount: number
    reservationsCount: number
    teamSize: number
    lastActiveAt: string | null
}

type FilterChip = 'all' | 'hot' | 'warm' | 'stale' | 'expiring'

function slugify(input: string): string {
    return input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
}

function tierOf(score: number): 'hot' | 'warm' | 'stale' {
    if (score >= 60) return 'hot'
    if (score >= 30) return 'warm'
    return 'stale'
}

function tierColor(tier: 'hot' | 'warm' | 'stale'): string {
    if (tier === 'hot') return 'text-emerald-700 bg-emerald-50 border-emerald-200'
    if (tier === 'warm') return 'text-amber-700 bg-amber-50 border-amber-200'
    return 'text-rose-700 bg-rose-50 border-rose-200'
}

function daysUntil(iso: string | null): number | null {
    if (!iso) return null
    const ms = new Date(iso).getTime() - Date.now()
    return Math.round(ms / 86_400_000)
}

function relativeTime(iso: string | null): string {
    if (!iso) return 'never'
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 0) return 'in the future'
    const minutes = Math.round(ms / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.round(hours / 24)
    return `${days}d ago`
}

const PERSONAL_EMAIL_TEMPLATES: Record<
    'check_in' | 'feature_suggestion' | 'extension_offer',
    { label: string; subject: (orgName: string) => string; body: (ctx: PersonalEmailCtx) => string }
> = {
    check_in: {
        label: 'Casual check-in',
        subject: orgName => `Quick check-in on your ${orgName} trial`,
        body: ctx =>
            `Hi ${ctx.firstName ?? 'there'},\n\n` +
            `Just wanted to drop in personally — I noticed you've been trying lende for ${ctx.orgName}. ` +
            `So far you've added ${ctx.itemsCount} items and ${ctx.reservationsCount} reservations. ` +
            `If anything has been confusing or there's a feature you'd want, hit reply — I read every email.\n\n` +
            `— Rongze, founder`,
    },
    feature_suggestion: {
        label: 'Feature suggestion',
        subject: orgName => `What would make ${orgName} run better on lende?`,
        body: ctx =>
            `Hi ${ctx.firstName ?? 'there'},\n\n` +
            `You're using ${ctx.orgName} on lende — thanks for trying it. ` +
            `I'm shipping changes weekly and want to make sure I'm building the right things. ` +
            `What's one thing that's making you slow today? Even a one-line reply helps me a lot.\n\n` +
            `— Rongze, founder`,
    },
    extension_offer: {
        label: 'Trial extension offer',
        subject: orgName => `Want a few more days on lende for ${orgName}?`,
        body: ctx =>
            `Hi ${ctx.firstName ?? 'there'},\n\n` +
            `Your ${ctx.orgName} trial ends ${ctx.daysRemaining !== null ? `in ${ctx.daysRemaining} days` : 'soon'}. ` +
            `If you're close to deciding but need more time, reply to this email and I'll add 7 more days — no card required.\n\n` +
            `— Rongze, founder`,
    },
}

interface PersonalEmailCtx {
    firstName: string | null
    orgName: string
    itemsCount: number
    reservationsCount: number
    daysRemaining: number | null
}

interface SystemAdminClientProps {
    orgs: Org[]
    trials: TrialOrg[]
    ownerByOrg: Record<string, { email: string | null; name: string | null }>
}

export function SystemAdminClient({ orgs, trials, ownerByOrg }: SystemAdminClientProps) {
    const router = useRouter()

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <h1 className="text-2xl font-semibold">System Admin: Organizations</h1>

            <Tabs defaultValue="trials" className="w-full">
                <TabsList>
                    <TabsTrigger value="trials">Active Trials ({trials.length})</TabsTrigger>
                    <TabsTrigger value="all">All Organizations ({orgs.length})</TabsTrigger>
                    <TabsTrigger value="create">Create Org</TabsTrigger>
                </TabsList>

                <TabsContent value="trials" className="mt-6">
                    <ActiveTrialsView
                        trials={trials}
                        ownerByOrg={ownerByOrg}
                        onMutated={() => router.refresh()}
                    />
                </TabsContent>

                <TabsContent value="all" className="mt-6">
                    <AllOrgsView orgs={orgs} />
                </TabsContent>

                <TabsContent value="create" className="mt-6">
                    <CreateOrgForm onCreated={() => router.refresh()} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

// ============================================================
// Active Trials view (BRIEF-61 main surface)
// ============================================================
function ActiveTrialsView({
    trials,
    ownerByOrg,
    onMutated,
}: {
    trials: TrialOrg[]
    ownerByOrg: Record<string, { email: string | null; name: string | null }>
    onMutated: () => void
}) {
    const [chip, setChip] = useState<FilterChip>('all')

    const filtered = useMemo(() => {
        return trials.filter(t => {
            if (chip === 'all') return true
            if (chip === 'expiring') {
                const d = daysUntil(t.trialEndsAt)
                return d !== null && d <= 7
            }
            const tier = tierOf(t.engagementScore)
            return tier === chip
        })
    }, [trials, chip])

    // default sort: hot first (score desc)
    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => b.engagementScore - a.engagementScore)
    }, [filtered])

    const counts = useMemo(() => ({
        hot: trials.filter(t => tierOf(t.engagementScore) === 'hot').length,
        warm: trials.filter(t => tierOf(t.engagementScore) === 'warm').length,
        stale: trials.filter(t => tierOf(t.engagementScore) === 'stale').length,
        expiring: trials.filter(t => {
            const d = daysUntil(t.trialEndsAt)
            return d !== null && d <= 7
        }).length,
    }), [trials])

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Flame className="h-5 w-5" /> Active Trials — manage, don&apos;t approve
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <ChipButton chip="all" current={chip} onClick={setChip} label={`All (${trials.length})`} />
                    <ChipButton chip="hot" current={chip} onClick={setChip} label={`Hot ${counts.hot}`} />
                    <ChipButton chip="warm" current={chip} onClick={setChip} label={`Warm ${counts.warm}`} />
                    <ChipButton chip="stale" current={chip} onClick={setChip} label={`Stale ${counts.stale}`} />
                    <ChipButton chip="expiring" current={chip} onClick={setChip} label={`Expiring this week ${counts.expiring}`} />
                </div>

                {sorted.length === 0 && (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                        No trials match this filter.
                    </p>
                )}

                <div className="space-y-2">
                    {sorted.map(t => (
                        <TrialRow
                            key={t.id}
                            trial={t}
                            owner={ownerByOrg[t.id] ?? { email: null, name: null }}
                            onMutated={onMutated}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

function ChipButton({
    chip,
    current,
    onClick,
    label,
}: {
    chip: FilterChip
    current: FilterChip
    onClick: (c: FilterChip) => void
    label: string
}) {
    const isActive = chip === current
    return (
        <button
            type="button"
            onClick={() => onClick(chip)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
        >
            {label}
        </button>
    )
}

function TrialRow({
    trial,
    owner,
    onMutated,
}: {
    trial: TrialOrg
    owner: { email: string | null; name: string | null }
    onMutated: () => void
}) {
    const tier = tierOf(trial.engagementScore)
    const days = daysUntil(trial.trialEndsAt)

    return (
        <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{trial.name}</p>
                    <span className="text-xs text-muted-foreground">/{trial.slug}</span>
                    <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tierColor(tier)}`}
                        title={`engagement_score = ${trial.engagementScore.toFixed(1)}`}
                    >
                        {tier === 'hot' && '🟢 Hot '}
                        {tier === 'warm' && '🟡 Warm '}
                        {tier === 'stale' && '🔴 Stale '}
                        {trial.engagementScore.toFixed(0)}
                    </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                        {days === null
                            ? 'no trial end set'
                            : days < 0
                              ? `expired ${Math.abs(days)}d ago`
                              : `${days}d remaining`}
                    </span>
                    <span>· items: {trial.itemsCount}</span>
                    <span>· reservations: {trial.reservationsCount}</span>
                    <span>· team: {trial.teamSize}</span>
                    <span>· last login: {relativeTime(trial.lastActiveAt)}</span>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <ExtendTrialButton trial={trial} onDone={onMutated} />
                <SendPersonalEmailButton trial={trial} owner={owner} onDone={onMutated} />
                <ConvertToPaidButton trial={trial} onDone={onMutated} />
                <DeactivateButton trial={trial} onDone={onMutated} />
            </div>
        </div>
    )
}

// ============================================================
// Action 1: Extend trial 7d
// ============================================================
function ExtendTrialButton({ trial, onDone }: { trial: TrialOrg; onDone: () => void }) {
    const [open, setOpen] = useState(false)
    const [pending, startTransition] = useTransition()
    const [err, setErr] = useState<string | null>(null)

    const submit = () => {
        setErr(null)
        startTransition(async () => {
            const res = await extendTrialAction({ orgId: trial.id, days: 7 })
            if (!res.ok) {
                setErr(res.error)
                return
            }
            setOpen(false)
            onDone()
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen(true)}
                title="Extend trial by 7 days"
            >
                <CalendarPlus className="mr-1 h-4 w-4" />
                Extend 7d
            </Button>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Extend trial for {trial.name} by 7 days?</DialogTitle>
                    <DialogDescription>
                        We&apos;ll move <code>trial_ends_at</code> forward by 7 days and email the
                        owner about the extension.
                    </DialogDescription>
                </DialogHeader>
                {err && <p className="text-sm text-red-600">{err}</p>}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="ghost" disabled={pending}>Cancel</Button>
                    </DialogClose>
                    <Button onClick={submit} disabled={pending}>
                        {pending ? 'Extending…' : 'Extend trial'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================
// Action 2: Send personal email (mailto from Rongze's own inbox)
// ============================================================
function SendPersonalEmailButton({
    trial,
    owner,
    onDone,
}: {
    trial: TrialOrg
    owner: { email: string | null; name: string | null }
    onDone: () => void
}) {
    const [open, setOpen] = useState(false)
    const [templateKey, setTemplateKey] = useState<
        'check_in' | 'feature_suggestion' | 'extension_offer'
    >('check_in')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [pending, startTransition] = useTransition()

    const ctx: PersonalEmailCtx = {
        firstName: owner.name?.split(' ')[0] ?? null,
        orgName: trial.name,
        itemsCount: trial.itemsCount,
        reservationsCount: trial.reservationsCount,
        daysRemaining: daysUntil(trial.trialEndsAt),
    }

    const applyTemplate = (key: 'check_in' | 'feature_suggestion' | 'extension_offer') => {
        const tpl = PERSONAL_EMAIL_TEMPLATES[key]
        setTemplateKey(key)
        setSubject(tpl.subject(trial.name))
        setBody(tpl.body(ctx))
    }

    const launch = () => {
        if (!owner.email) return
        const mailto = `mailto:${owner.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        // Audit row first; the mailto: launches client-side regardless of result.
        startTransition(async () => {
            await sendPersonalEmailAction({ orgId: trial.id, templateKey })
            window.location.href = mailto
            setOpen(false)
            onDone()
        })
    }

    return (
        <Dialog open={open} onOpenChange={(v) => {
            setOpen(v)
            if (v && !subject) applyTemplate('check_in')
        }}>
            <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen(true)}
                title="Compose a personal email from your inbox"
                disabled={!owner.email}
            >
                <Mail className="mr-1 h-4 w-4" />
                Email
            </Button>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Send personal email to {trial.name}</DialogTitle>
                    <DialogDescription>
                        This opens your default mail client with a pre-filled draft. The email is
                        sent from your own inbox — not from lende&apos;s notifications. Recent activity:
                        items {trial.itemsCount} · reservations {trial.reservationsCount} ·
                        last login {relativeTime(trial.lastActiveAt)}.
                    </DialogDescription>
                </DialogHeader>

                {!owner.email && (
                    <p className="text-sm text-amber-700">No owner email on file for this org.</p>
                )}

                <div className="flex flex-wrap gap-2">
                    {(Object.keys(PERSONAL_EMAIL_TEMPLATES) as Array<keyof typeof PERSONAL_EMAIL_TEMPLATES>).map(k => (
                        <Button
                            key={k}
                            type="button"
                            size="sm"
                            variant={templateKey === k ? 'default' : 'outline'}
                            onClick={() => applyTemplate(k)}
                        >
                            {PERSONAL_EMAIL_TEMPLATES[k].label}
                        </Button>
                    ))}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email-subject">Subject</Label>
                    <Input
                        id="email-subject"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email-body">Body</Label>
                    <Textarea
                        id="email-body"
                        rows={10}
                        value={body}
                        onChange={e => setBody(e.target.value)}
                    />
                </div>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="ghost" disabled={pending}>Cancel</Button>
                    </DialogClose>
                    <Button onClick={launch} disabled={pending || !owner.email}>
                        <Sparkles className="mr-1 h-4 w-4" />
                        {pending ? 'Logging…' : 'Send via my email'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================
// Action 3: Convert to paid
// ============================================================
function ConvertToPaidButton({ trial, onDone }: { trial: TrialOrg; onDone: () => void }) {
    const [open, setOpen] = useState(false)
    const [subId, setSubId] = useState('')
    const [pending, startTransition] = useTransition()
    const [err, setErr] = useState<string | null>(null)

    const submit = () => {
        setErr(null)
        startTransition(async () => {
            const res = await convertToPaidAction({ orgId: trial.id, subscriptionId: subId })
            if (!res.ok) {
                setErr(res.error)
                return
            }
            setOpen(false)
            setSubId('')
            onDone()
        })
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen(true)}
                title="Mark this org as paid"
            >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Convert
            </Button>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Mark {trial.name} as paid?</DialogTitle>
                    <DialogDescription>
                        Sets <code>subscription_status = &apos;active&apos;</code> and stores the
                        Lemon Squeezy subscription id. Use the LS dashboard to actually issue the
                        invoice; this only flips our DB row.
                    </DialogDescription>
                </DialogHeader>
                <Label htmlFor="sub-id">Subscription id (Lemon Squeezy / invoice ref)</Label>
                <Input
                    id="sub-id"
                    value={subId}
                    onChange={e => setSubId(e.target.value)}
                    placeholder="ls_sub_xxx or invoice-2026-001"
                    disabled={pending}
                />
                {err && <p className="text-sm text-red-600">{err}</p>}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="ghost" disabled={pending}>Cancel</Button>
                    </DialogClose>
                    <Button onClick={submit} disabled={pending || subId.trim().length === 0}>
                        {pending ? 'Saving…' : 'Mark as paid'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================
// Action 4: Deactivate (double-confirm)
// ============================================================
function DeactivateButton({ trial, onDone }: { trial: TrialOrg; onDone: () => void }) {
    const [open, setOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [confirmText, setConfirmText] = useState('')
    const [pending, startTransition] = useTransition()
    const [err, setErr] = useState<string | null>(null)

    const submit = () => {
        setErr(null)
        startTransition(async () => {
            const res = await deactivateOrgAction({ orgId: trial.id, reason })
            if (!res.ok) {
                setErr(res.error)
                return
            }
            setOpen(false)
            setReason('')
            setConfirmText('')
            onDone()
        })
    }

    const canSubmit =
        reason.trim().length >= 3
        && confirmText.trim().toLowerCase() === trial.slug.toLowerCase()
        && !pending

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                setOpen(v)
                if (!v) {
                    setReason('')
                    setConfirmText('')
                    setErr(null)
                }
            }}
        >
            <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen(true)}
                className="text-rose-700 hover:text-rose-700"
                title="Deactivate this org"
            >
                <XCircle className="mr-1 h-4 w-4" />
                Deactivate
            </Button>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Deactivate {trial.name}?</DialogTitle>
                    <DialogDescription>
                        Sets <code>subscription_status = &apos;cancelled&apos;</code>. Data is preserved
                        for 90 days, then archived. Type the org slug to confirm.
                    </DialogDescription>
                </DialogHeader>

                <Label htmlFor="deact-reason">Reason (required)</Label>
                <Input
                    id="deact-reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="e.g. inactive 60 days"
                    disabled={pending}
                />

                <Label htmlFor="deact-confirm">
                    Type <code>{trial.slug}</code> to confirm
                </Label>
                <Input
                    id="deact-confirm"
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={trial.slug}
                    disabled={pending}
                />

                {err && <p className="text-sm text-red-600">{err}</p>}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="ghost" disabled={pending}>Cancel</Button>
                    </DialogClose>
                    <Button
                        onClick={submit}
                        disabled={!canSubmit}
                        className="bg-rose-700 hover:bg-rose-800"
                    >
                        <Snowflake className="mr-1 h-4 w-4" />
                        {pending ? 'Deactivating…' : 'Deactivate'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================
// All Orgs view (legacy listing — All / Paid / Cancelled implicit)
// ============================================================
function AllOrgsView({ orgs }: { orgs: Org[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Organizations ({orgs.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {orgs.map(org => (
                    <div
                        key={org.id}
                        className="flex items-center justify-between rounded-md border p-3"
                    >
                        <div>
                            <p className="text-sm font-medium">{org.name}</p>
                            <p className="text-xs text-muted-foreground">
                                /{org.slug} — created{' '}
                                {new Date(org.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">{org.plan ?? 'trial'}</Badge>
                            <Badge variant="outline">
                                {org.subscriptionStatus ?? 'trialing'}
                            </Badge>
                        </div>
                    </div>
                ))}
                {orgs.length === 0 && (
                    <p className="text-sm text-muted-foreground">No organizations yet.</p>
                )}
            </CardContent>
        </Card>
    )
}

// ============================================================
// Create-org form (existing functionality preserved)
// ============================================================
function CreateOrgForm({ onCreated }: { onCreated: () => void }) {
    const [isPending, startTransition] = useTransition()
    const [orgName, setOrgName] = useState('')
    const [slug, setSlug] = useState('')
    const [slugTouched, setSlugTouched] = useState(false)
    const [adminEmail, setAdminEmail] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const effectiveSlug = slugTouched ? slug : slugify(orgName)

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        startTransition(async () => {
            const result = await systemCreateOrgAction({
                orgName,
                slug: effectiveSlug,
                adminEmail,
            })

            if (!result.ok) {
                setError(result.error)
                return
            }

            setSuccess(
                result.emailSent
                    ? `Organization "${orgName}" created. Invitation sent to ${adminEmail}.`
                    : `Organization "${orgName}" created. Invitation created but email delivery failed.`
            )
            setOrgName('')
            setSlug('')
            setSlugTouched(false)
            setAdminEmail('')
            onCreated()
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Create Organization + Invite Admin
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="org-name">Organization Name</Label>
                        <Input
                            id="org-name"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            placeholder="e.g. Ivy J Studio"
                            disabled={isPending}
                        />
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor="org-slug">URL Slug</Label>
                        <div className="flex items-center rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                            <span className="px-3 text-sm text-muted-foreground select-none border-r border-input bg-slate-50">
                                lende.shipbyx.com/
                            </span>
                            <input
                                id="org-slug"
                                type="text"
                                value={effectiveSlug}
                                onChange={(e) => {
                                    setSlugTouched(true)
                                    setSlug(slugify(e.target.value))
                                }}
                                onFocus={() => setSlugTouched(true)}
                                placeholder="ivyjstudio"
                                disabled={isPending}
                                className="flex-1 px-3 py-2 text-sm bg-transparent outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor="admin-email">Admin Email (will receive invitation)</Label>
                        <Input
                            id="admin-email"
                            type="email"
                            value={adminEmail}
                            onChange={(e) => setAdminEmail(e.target.value)}
                            placeholder="admin@studio.com"
                            disabled={isPending}
                        />
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="rounded-md bg-green-50 p-3 text-sm text-green-600">
                            {success}
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={!orgName || !effectiveSlug || !adminEmail || isPending}
                    >
                        {isPending ? 'Creating...' : 'Create & Send Invitation'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
