import * as React from 'react'

/**
 * BRIEF-61 admin-way step 5 — Friday 9am NZT founder digest email.
 * Rendered via react-email by the cron route at
 * src/app/api/cron/weekly-digest/route.ts. Resend sends to env
 * WEEKLY_DIGEST_TO_EMAIL.
 *
 * Layout follows research §2.4: counts at top, expiring this week,
 * new signups list, conversion / churn, suggested actions.
 * Lean (5-8 metrics) per [SoftwareSeni solo founder metrics].
 */

export interface WeeklyDigestProps {
    weekLabel: string                // "Week of 2026-05-04"
    activeTrialsCount: number
    activeTrialsDelta: number        // +/- vs last week
    hotCount: number
    warmCount: number
    staleCount: number
    expiringThisWeek: Array<{
        slug: string
        name: string
        daysRemaining: number
        tier: 'hot' | 'warm' | 'stale'
        lastLoginAt: string | null
    }>
    newSignupsThisWeek: Array<{
        slug: string
        name: string
        signedUpDaysAgo: number
        activated: boolean
    }>
    conversionsThisWeek: number
    churnThisWeek: number
    suggestedActions: string[]       // human-readable suggestions
    siteUrl: string
    generatedAtIso: string
}

const sectionH = {
    fontSize: 14,
    fontWeight: 700,
    margin: '24px 0 8px',
    color: '#0f172a',
} as const

const tierBadge: Record<'hot' | 'warm' | 'stale', React.CSSProperties> = {
    hot: { color: '#047857', background: '#d1fae5', padding: '2px 8px', borderRadius: 12, fontSize: 11 },
    warm: { color: '#a16207', background: '#fef3c7', padding: '2px 8px', borderRadius: 12, fontSize: 11 },
    stale: { color: '#9f1239', background: '#ffe4e6', padding: '2px 8px', borderRadius: 12, fontSize: 11 },
}

export function WeeklyDigestEmail(props: WeeklyDigestProps) {
    const deltaSign = props.activeTrialsDelta > 0 ? '+' : ''
    const dashboardUrl = `${props.siteUrl}/system-admin/orgs`

    return (
        <html>
            <head />
            <body style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#0f172a', lineHeight: 1.5, padding: 24, background: '#f8fafc' }}>
                <div style={{ maxWidth: 620, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
                    <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>lende weekly · {props.weekLabel}</h1>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
                        Quick scan of your trial pool. Manage from{' '}
                        <a href={dashboardUrl} style={{ color: '#0369a1' }}>{dashboardUrl}</a>.
                    </p>

                    <div style={{ borderTop: '1px solid #e2e8f0' }} />

                    <h2 style={sectionH}>Active trials: {props.activeTrialsCount} ({deltaSign}{props.activeTrialsDelta} vs last week)</h2>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                        <li>🟢 Hot: {props.hotCount}</li>
                        <li>🟡 Warm: {props.warmCount}</li>
                        <li>🔴 Stale: {props.staleCount}</li>
                    </ul>

                    <h2 style={sectionH}>Expiring this week: {props.expiringThisWeek.length}</h2>
                    {props.expiringThisWeek.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#64748b' }}>None — quiet week.</p>
                    ) : (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                            {props.expiringThisWeek.map(o => (
                                <li key={o.slug} style={{ marginBottom: 4 }}>
                                    <strong>{o.name}</strong> (/{o.slug}) — day{' '}
                                    {14 - o.daysRemaining}, <span style={tierBadge[o.tier]}>{o.tier}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    <h2 style={sectionH}>This week&apos;s signups: {props.newSignupsThisWeek.length}</h2>
                    {props.newSignupsThisWeek.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#64748b' }}>No new signups.</p>
                    ) : (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                            {props.newSignupsThisWeek.map(s => (
                                <li key={s.slug}>
                                    <strong>{s.name}</strong> — day {s.signedUpDaysAgo},{' '}
                                    {s.activated ? '✅ activated' : 'not activated yet'}
                                </li>
                            ))}
                        </ul>
                    )}

                    <h2 style={sectionH}>Conversion & churn</h2>
                    <p style={{ fontSize: 13, margin: '0 0 4px' }}>
                        ✓ {props.conversionsThisWeek} trial → paid this week
                    </p>
                    <p style={{ fontSize: 13, margin: '0 0 4px' }}>
                        ⤬ {props.churnThisWeek} deactivated this week
                    </p>

                    <h2 style={sectionH}>Top actions for you</h2>
                    {props.suggestedActions.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#64748b' }}>No suggested actions — keep shipping.</p>
                    ) : (
                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                            {props.suggestedActions.map((a, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>{a}</li>
                            ))}
                        </ol>
                    )}

                    <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8' }}>
                        Generated at {props.generatedAtIso}. Next digest Friday 9am NZT.
                    </div>
                </div>
            </body>
        </html>
    )
}

export function weeklyDigestSubject(weekLabel: string, expiringCount: number) {
    if (expiringCount === 0) {
        return `lende weekly · ${weekLabel}`
    }
    return `lende weekly · ${weekLabel} (${expiringCount} expiring)`
}
