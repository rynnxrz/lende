import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import * as React from 'react'
import { WeeklyDigestEmail, weeklyDigestSubject, type WeeklyDigestProps } from '@/lib/email/weekly-digest'

/**
 * BRIEF-61 admin-way step 5 — Friday 9am NZT founder weekly digest.
 *
 * vercel.json schedule "0 21 * * 4" UTC = Thursday 21:00 UTC = Friday 9:00 NZST.
 * (NZST = UTC+12. NZDT = UTC+13 in summer; we accept that the digest will arrive
 * at 10am during daylight savings until we add timezone-aware scheduling.)
 *
 * env required:
 *   - CRON_SECRET (Bearer auth)
 *   - WEEKLY_DIGEST_ENABLED='true' (feature flag, default off)
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - RESEND_API_KEY
 *   - WEEKLY_DIGEST_TO_EMAIL (Rongze's inbox)
 *
 * Manual trigger for testing:
 *   curl localhost:3000/api/cron/weekly-digest \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */

const FROM = 'lende <notifications@shipbyx.com>'
const REPLY_TO = 'founder@shipbyx.com'

interface OrgRow {
    id: string
    slug: string
    name: string
    plan: string | null
    trial_ends_at: string | null
    subscription_status: string | null
    created_at: string
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (process.env.WEEKLY_DIGEST_ENABLED !== 'true') {
        return NextResponse.json({ skipped: true, reason: 'WEEKLY_DIGEST_ENABLED is not true' })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendKey = process.env.RESEND_API_KEY
    const toEmail = process.env.WEEKLY_DIGEST_TO_EMAIL
    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }
    if (!resendKey) {
        return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }
    if (!toEmail) {
        return NextResponse.json({ error: 'WEEKLY_DIGEST_TO_EMAIL not configured' }, { status: 500 })
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceKey)
    const resend = new Resend(resendKey)

    try {
        // ============================================================
        // Pull active trials
        // ============================================================
        const { data: orgsRaw, error: orgsErr } = await supabase
            .from('organizations')
            .select('id, slug, name, plan, trial_ends_at, subscription_status, created_at')
            .or('subscription_status.is.null,subscription_status.eq.trialing')
            .order('created_at', { ascending: false })

        if (orgsErr) {
            console.error('[weekly-digest] orgs fetch error', orgsErr)
            return NextResponse.json({ error: orgsErr.message }, { status: 500 })
        }

        const orgs = (orgsRaw ?? []) as OrgRow[]

        // engagement scores in parallel (uses RPC from migration 00065)
        const scoresEntries = await Promise.all(
            orgs.map(async o => {
                const { data, error } = await supabase.rpc('engagement_score', { p_org_id: o.id })
                if (error) {
                    console.error('[weekly-digest] score error', o.slug, error.message)
                    return [o.id, 0] as const
                }
                const num = typeof data === 'number' ? data : Number(data ?? 0)
                return [o.id, Number.isFinite(num) ? num : 0] as const
            })
        )
        const scoreById = new Map(scoresEntries)

        const tierOf = (s: number): 'hot' | 'warm' | 'stale' =>
            s >= 60 ? 'hot' : s >= 30 ? 'warm' : 'stale'

        const daysUntil = (iso: string | null): number | null => {
            if (!iso) return null
            return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
        }

        // ============================================================
        // Aggregate counts
        // ============================================================
        const tiers = orgs.map(o => tierOf(scoreById.get(o.id) ?? 0))
        const hotCount = tiers.filter(t => t === 'hot').length
        const warmCount = tiers.filter(t => t === 'warm').length
        const staleCount = tiers.filter(t => t === 'stale').length

        const expiringThisWeek = orgs
            .map(o => {
                const d = daysUntil(o.trial_ends_at)
                return { o, d }
            })
            .filter(({ d }) => d !== null && d >= 0 && d <= 7)
            .map(({ o, d }) => ({
                slug: o.slug,
                name: o.name,
                daysRemaining: d ?? 0,
                tier: tierOf(scoreById.get(o.id) ?? 0),
                lastLoginAt: null as string | null,
            }))

        // last-login lookup for expiring rows (one round-trip per row, bounded by N <= ~10)
        await Promise.all(
            expiringThisWeek.map(async row => {
                const matchOrg = orgs.find(x => x.slug === row.slug)
                if (!matchOrg) return
                const { data } = await supabase
                    .from('organization_members')
                    .select('profiles!inner(last_active_at)')
                    .eq('organization_id', matchOrg.id)
                    .order('profiles(last_active_at)', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                const las = (data as unknown as
                    { profiles?: { last_active_at?: string | null } | null } | null
                )?.profiles?.last_active_at ?? null
                row.lastLoginAt = las
            })
        )

        // ============================================================
        // New signups this week (created within last 7d)
        // ============================================================
        const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000)
        const { data: newSignupsRaw } = await supabase
            .from('organizations')
            .select('id, slug, name, created_at')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })

        const newSignupsThisWeek = await Promise.all(
            (newSignupsRaw ?? []).map(async (o: { id: string; slug: string; name: string; created_at: string }) => {
                const { count } = await supabase
                    .from('items')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', o.id)
                const signedUpDaysAgo = Math.round(
                    (Date.now() - new Date(o.created_at).getTime()) / 86_400_000
                )
                return {
                    slug: o.slug,
                    name: o.name,
                    signedUpDaysAgo,
                    activated: (count ?? 0) > 0,
                }
            })
        )

        // ============================================================
        // Conversions / churn this week (from org_admin_events)
        // ============================================================
        const { count: conversionsThisWeek } = await supabase
            .from('org_admin_events')
            .select('id', { count: 'exact', head: true })
            .eq('action', 'set_subscription_active')
            .gte('created_at', sevenDaysAgo.toISOString())

        const { count: churnThisWeek } = await supabase
            .from('org_admin_events')
            .select('id', { count: 'exact', head: true })
            .eq('action', 'deactivate_org')
            .gte('created_at', sevenDaysAgo.toISOString())

        // ============================================================
        // Suggested actions (heuristic — top 3 hot orgs that are
        // approaching trial end without payment)
        // ============================================================
        const suggestedActions: string[] = []
        const hotOrgs = orgs
            .map(o => ({ o, score: scoreById.get(o.id) ?? 0 }))
            .filter(({ score }) => tierOf(score) === 'hot')
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
        for (const { o, score } of hotOrgs) {
            const d = daysUntil(o.trial_ends_at)
            if (d !== null && d <= 5) {
                suggestedActions.push(
                    `Email ${o.name} founder — score ${score.toFixed(0)}, trial ends in ${d}d, no card on file.`
                )
            } else {
                suggestedActions.push(
                    `Check in with ${o.name} — score ${score.toFixed(0)}, hot trial, opportunity to convert early.`
                )
            }
        }

        // last-week active trial count for delta
        let activeTrialsDelta = 0
        try {
            const lastWeekISO = new Date(Date.now() - 14 * 86_400_000).toISOString()
            const thisWeekStartISO = sevenDaysAgo.toISOString()
            const { count: addedThisWeek } = await supabase
                .from('organizations')
                .select('id', { count: 'exact', head: true })
                .gte('created_at', thisWeekStartISO)
                .or('subscription_status.is.null,subscription_status.eq.trialing')
            const { count: deactivatedThisWeek } = await supabase
                .from('org_admin_events')
                .select('id', { count: 'exact', head: true })
                .eq('action', 'deactivate_org')
                .gte('created_at', thisWeekStartISO)
            const { count: convertedThisWeek } = await supabase
                .from('org_admin_events')
                .select('id', { count: 'exact', head: true })
                .eq('action', 'set_subscription_active')
                .gte('created_at', thisWeekStartISO)
            activeTrialsDelta =
                (addedThisWeek ?? 0)
                - (deactivatedThisWeek ?? 0)
                - (convertedThisWeek ?? 0)
            void lastWeekISO
        } catch (err) {
            console.error('[weekly-digest] delta calc error', err)
        }

        // ============================================================
        // Build + send email
        // ============================================================
        const today = new Date()
        const monday = new Date(today)
        monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7))
        const weekLabel = `Week of ${monday.toISOString().slice(0, 10)}`

        const props: WeeklyDigestProps = {
            weekLabel,
            activeTrialsCount: orgs.length,
            activeTrialsDelta,
            hotCount,
            warmCount,
            staleCount,
            expiringThisWeek,
            newSignupsThisWeek,
            conversionsThisWeek: conversionsThisWeek ?? 0,
            churnThisWeek: churnThisWeek ?? 0,
            suggestedActions,
            siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://lende.shipbyx.com',
            generatedAtIso: new Date().toISOString(),
        }

        const subject = weeklyDigestSubject(weekLabel, expiringThisWeek.length)
        const result = await resend.emails.send({
            from: FROM,
            replyTo: REPLY_TO,
            to: [toEmail],
            subject,
            react: React.createElement(WeeklyDigestEmail, props),
            tags: [{ name: 'category', value: 'weekly-digest' }],
        })

        if (result?.error) {
            console.error('[weekly-digest] resend error', result.error)
            return NextResponse.json(
                { error: result.error.message ?? String(result.error) },
                { status: 500 }
            )
        }

        return NextResponse.json({
            sent: true,
            eventId: result?.data?.id ?? null,
            metrics: {
                activeTrialsCount: orgs.length,
                hotCount,
                warmCount,
                staleCount,
                expiringThisWeek: expiringThisWeek.length,
                newSignupsThisWeek: newSignupsThisWeek.length,
                conversionsThisWeek: conversionsThisWeek ?? 0,
                churnThisWeek: churnThisWeek ?? 0,
            },
        })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[weekly-digest] threw', err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
