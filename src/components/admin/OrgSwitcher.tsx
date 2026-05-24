'use client'

/**
 * BRIEF-63 — in-session OrgSwitcher dropdown for the admin sidebar.
 *
 * Complements BRIEF-60 (`/select-workspace` login picker + the
 * `setActiveOrgAndRedirectAction` server action). After login, a user
 * with ≥ 2 organization memberships can flip workspaces from any
 * admin page without signing out.
 *
 * Constraints honored:
 *   - Single source of truth for the switch logic is BRIEF-60's
 *     `setActiveOrgAndRedirectAction`. We call it, then `router.refresh()`
 *     + `router.push('/<new-slug>/admin')` to defuse stale RSC cache
 *     (Risk 1 in brief premortem).
 *   - State mutations live inside event handlers — no useEffect setState
 *     (avoids the eslint `set-state-in-effect` anti-pattern surfaced in
 *     BRIEF-62).
 *   - Single-org users get a plain display (icon + name + role pill, no
 *     chevron, not clickable) to avoid an empty dropdown.
 *   - Current org row is highlighted, role-pill colored, no-op on click,
 *     and carries `aria-current="true"` so the destructive-context cue
 *     (Risk 3) is reinforced.
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeftRight, Building2, Check, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setActiveOrgAndRedirectAction } from '@/app/select-workspace/select-workspace-action'

export interface OrgSwitcherMembership {
    organization_id: string
    role: string
    organizations: {
        id: string
        slug: string
        name: string
    } | null
}

export interface OrgSwitcherProps {
    currentOrg: { id: string; slug: string; name: string }
    currentRole: string
    memberships: OrgSwitcherMembership[]
    /**
     * Trigger layout flag: `expanded=true` shows icon + name + role + chevron,
     * `expanded=false` collapses to icon-only (used by the desktop sidebar's
     * hover-expand pattern). Mobile callers pass `expanded` permanently true.
     */
    expanded: boolean
}

function roleBadgeClasses(role: string): string {
    switch (role) {
        case 'owner':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        case 'admin':
            return 'bg-blue-50 text-blue-700 border-blue-200'
        case 'staff':
            return 'bg-muted text-foreground border-border'
        default:
            return 'bg-muted text-foreground border-border'
    }
}

export function OrgSwitcher({
    currentOrg,
    currentRole,
    memberships,
    expanded,
}: OrgSwitcherProps) {
    const router = useRouter()
    const [pendingId, setPendingId] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)

    const isMultiOrg = memberships.length > 1
    const isSwitching = pendingId !== null

    const handleSwitch = async (
        orgId: string,
        fallbackSlug: string,
        orgName: string,
    ): Promise<void> => {
        if (orgId === currentOrg.id) return
        if (isSwitching) return
        setError(null)
        setPendingId(orgId)
        const res = await setActiveOrgAndRedirectAction(orgId)
        if (!res.ok) {
            setPendingId(null)
            const msg = res.error ?? 'Could not switch workspaces.'
            setError(msg)
            toast.error(msg)
            return
        }
        const targetSlug = res.slug ?? fallbackSlug
        toast.success(`Switched to ${orgName}`)
        router.refresh()
        router.push(`/${targetSlug}/admin`)
    }

    // ── Single-org path: minimal dropdown with "Add workspace" option. ───
    if (!isMultiOrg) {
        return (
            <div className="px-2 pb-1">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            title={!expanded ? `${currentOrg.name} · ${currentRole}` : undefined}
                            data-testid="org-switcher-single"
                            aria-label={`Workspace: ${currentOrg.name}`}
                            className={cn(
                                'flex w-full items-center rounded-lg py-2 text-sm font-medium text-foreground transition-colors',
                                'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                expanded ? 'gap-2 px-3' : 'justify-center px-2',
                            )}
                        >
                            <Building2 className="h-5 w-5 flex-shrink-0 text-foreground" />
                            {expanded && (
                                <>
                                    <span className="min-w-0 flex-1 truncate text-left">
                                        {currentOrg.name}
                                    </span>
                                    <span
                                        className={cn(
                                            'rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                                            roleBadgeClasses(currentRole),
                                        )}
                                    >
                                        {currentRole}
                                    </span>
                                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                </>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        side="bottom"
                        sideOffset={6}
                        className="w-64"
                    >
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Workspace
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                            disabled
                            aria-current="true"
                            className="flex items-start gap-2 px-2 py-2 bg-muted cursor-default"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium text-foreground">
                                        {currentOrg.name}
                                    </span>
                                    <span
                                        className={cn(
                                            'rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                                            roleBadgeClasses(currentRole),
                                        )}
                                    >
                                        {currentRole}
                                    </span>
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    /{currentOrg.slug}
                                </p>
                            </div>
                            <Check className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-600" />
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link
                                href="/signup"
                                className="flex items-center gap-2 px-2 py-2 text-sm text-foreground"
                            >
                                <Plus className="h-4 w-4" />
                                <span>Add workspace</span>
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        )
    }

    // ── Multi-org path: shadcn DropdownMenu trigger. ──────────────────────
    return (
        <div className="px-2 pb-1">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        title={!expanded ? `${currentOrg.name} · ${currentRole}` : undefined}
                        data-testid="org-switcher-trigger"
                        aria-label={`Switch workspace (current: ${currentOrg.name}, ${currentRole})`}
                        className={cn(
                            'flex w-full items-center rounded-lg py-2 text-sm font-medium text-foreground transition-colors',
                            'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            expanded ? 'gap-2 px-3' : 'justify-center px-2',
                        )}
                    >
                        <Building2 className="h-5 w-5 flex-shrink-0 text-foreground" />
                        {expanded && (
                            <>
                                <span className="min-w-0 flex-1 truncate text-left">
                                    {currentOrg.name}
                                </span>
                                <span
                                    className={cn(
                                        'rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                                        roleBadgeClasses(currentRole),
                                    )}
                                >
                                    {currentRole}
                                </span>
                                <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            </>
                        )}
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    side="bottom"
                    sideOffset={6}
                    className="w-64"
                    data-testid="org-switcher-menu"
                >
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Workspaces
                    </DropdownMenuLabel>
                    {memberships.map((m) => {
                        const isCurrent = m.organization_id === currentOrg.id
                        const orgSlug = m.organizations?.slug ?? 'unknown'
                        const orgName = m.organizations?.name ?? orgSlug
                        const isLoading = pendingId === m.organization_id
                        return (
                            <DropdownMenuItem
                                key={m.organization_id}
                                onSelect={(event) => {
                                    if (isCurrent) {
                                        event.preventDefault()
                                        return
                                    }
                                    // Fire-and-forget; menu closes naturally
                                    // once Radix processes the select event.
                                    void handleSwitch(m.organization_id, orgSlug, orgName)
                                }}
                                disabled={!isCurrent && isSwitching}
                                aria-current={isCurrent ? 'true' : undefined}
                                data-current={isCurrent ? 'true' : undefined}
                                data-testid={
                                    isCurrent
                                        ? 'org-switcher-item-current'
                                        : 'org-switcher-item'
                                }
                                className={cn(
                                    'flex items-start gap-2 px-2 py-2',
                                    isCurrent && 'bg-muted cursor-default',
                                )}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {orgName}
                                        </span>
                                        <span
                                            className={cn(
                                                'rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                                                roleBadgeClasses(m.role),
                                            )}
                                        >
                                            {m.role}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                        /{orgSlug}
                                    </p>
                                </div>
                                {isCurrent ? (
                                    <Check className="mt-1 h-4 w-4 flex-shrink-0 text-emerald-600" />
                                ) : isLoading ? (
                                    <span
                                        aria-hidden="true"
                                        className="mt-1 h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-input border-t-foreground"
                                    />
                                ) : null}
                            </DropdownMenuItem>
                        )
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild data-testid="org-switcher-all">
                        <Link
                            href="/select-workspace"
                            className="flex items-center gap-2 px-2 py-2 text-sm text-foreground"
                        >
                            <ArrowLeftRight className="h-4 w-4" />
                            <span>All workspaces</span>
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild data-testid="org-switcher-add">
                        <Link
                            href="/signup"
                            className="flex items-center gap-2 px-2 py-2 text-sm text-foreground"
                        >
                            <Plus className="h-4 w-4" />
                            <span>Add workspace</span>
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {error && (
                <div
                    role="alert"
                    className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700"
                >
                    Could not switch workspaces: {error}
                </div>
            )}
        </div>
    )
}
