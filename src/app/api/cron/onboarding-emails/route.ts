import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import * as React from 'react'
import {
    OnboardingDay1,
    onboardingDay1Subject,
} from '@/lib/email/templates/onboarding-day-1'
import {
    OnboardingDay3,
    onboardingDay3Subject,
} from '@/lib/email/templates/onboarding-day-3'
import {
    OnboardingDay7,
    onboardingDay7Subject,
} from '@/lib/email/templates/onboarding-day-7'
import {
    OnboardingDay9,
    onboardingDay9Subject,
} from '@/lib/email/templates/onboarding-day-9'
import {
    OnboardingDay11,
    onboardingDay11Subject,
} from '@/lib/email/templates/onboarding-day-11'
import {
    OnboardingDay13,
    onboardingDay13Subject,
} from '@/lib/email/templates/onboarding-day-13'

const TRIGGER_DAYS = [1, 3, 7, 9, 11, 13] as const
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://lende.shipbyx.com'
const FROM = 'lende <notifications@shipbyx.com>'
const REPLY_TO = 'founder@shipbyx.com'

interface SentEvent {
    day: number
    to: string
    eventId: string | null
    error?: string
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (process.env.ONBOARDING_EMAILS_ENABLED !== 'true') {
        return NextResponse.json({ skipped: true, reason: 'ONBOARDING_EMAILS_ENABLED is not true' })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendKey = process.env.RESEND_API_KEY
    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
    }
    if (!resendKey) {
        return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceKey)
    const resend = new Resend(resendKey)
    const testInboxOverride = process.env.RESEND_TEST_INBOX

    const events: SentEvent[] = []
    let sent = 0
    let failed = 0

    for (const day of TRIGGER_DAYS) {
        const { data: members, error: memberErr } = await supabase
            .from('organization_members')
            .select(
                `user_id,
                organization_id,
                accepted_at,
                organizations!inner (slug, name, subscription_status)`
            )
            .filter('organizations.subscription_status', 'in', '("trialing","trial")')
            .gte('accepted_at', dayAgo(day))
            .lt('accepted_at', dayAgo(day - 1))

        if (memberErr) {
            console.error(`[onboarding-emails] day ${day} query error`, memberErr)
            continue
        }
        if (!members?.length) continue

        for (const member of members) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', member.user_id)
                .single()

            if (!profile?.email) continue

            const org = member.organizations as unknown as { slug: string; name: string }
            const adminUrl = `${SITE_URL}/${org.slug}/admin`
            const pricingUrl = `${SITE_URL}/pricing`
            const recipient = testInboxOverride || profile.email

            let component: React.ReactElement
            let subject: string

            if (day === 1) {
                component = React.createElement(OnboardingDay1, {
                    orgName: org.name,
                    adminUrl,
                    siteUrl: SITE_URL,
                })
                subject = onboardingDay1Subject()
            } else if (day === 3) {
                component = React.createElement(OnboardingDay3, {
                    orgName: org.name,
                    adminUrl,
                    siteUrl: SITE_URL,
                })
                subject = onboardingDay3Subject()
            } else if (day === 7) {
                const { count: listingCount } = await supabase
                    .from('items')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', member.organization_id)
                const { count: reservationCount } = await supabase
                    .from('reservations')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', member.organization_id)

                component = React.createElement(OnboardingDay7, {
                    orgName: org.name,
                    adminUrl,
                    listingCount: listingCount ?? 0,
                    reservationCount: reservationCount ?? 0,
                    siteUrl: SITE_URL,
                })
                subject = onboardingDay7Subject(listingCount ?? 0, reservationCount ?? 0)
            } else if (day === 9) {
                component = React.createElement(OnboardingDay9, {
                    orgName: org.name,
                    pricingUrl,
                    siteUrl: SITE_URL,
                })
                subject = onboardingDay9Subject()
            } else if (day === 11) {
                const { count: reservationCountThisWeek } = await supabase
                    .from('reservations')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', member.organization_id)
                    .gte('created_at', dayAgo(7))

                const { count: listingCountForDay11 } = await supabase
                    .from('items')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', member.organization_id)
                const { count: teamSizeForDay11 } = await supabase
                    .from('organization_members')
                    .select('user_id', { count: 'exact', head: true })
                    .eq('organization_id', member.organization_id)
                component = React.createElement(OnboardingDay11, {
                    orgName: org.name,
                    pricingUrl,
                    weekReservations: reservationCountThisWeek ?? 0,
                    listings: listingCountForDay11 ?? 0,
                    teamSize: teamSizeForDay11 ?? 1,
                    siteUrl: SITE_URL,
                })
                subject = onboardingDay11Subject()
            } else {
                const { count: listingCount } = await supabase
                    .from('items')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', member.organization_id)

                component = React.createElement(OnboardingDay13, {
                    orgName: org.name,
                    pricingUrl,
                    listingCount: listingCount ?? 0,
                    siteUrl: SITE_URL,
                })
                subject = onboardingDay13Subject(listingCount ?? 0)
            }

            try {
                const result = await resend.emails.send({
                    from: FROM,
                    replyTo: REPLY_TO,
                    to: [recipient],
                    subject,
                    react: component,
                    tags: [{ name: 'onboarding-day', value: String(day) }],
                })

                const eventId = result?.data?.id ?? null
                if (result?.error) {
                    failed++
                    events.push({
                        day,
                        to: recipient,
                        eventId: null,
                        error: result.error.message ?? String(result.error),
                    })
                    console.error(`[onboarding-emails] day ${day} send error`, result.error)
                } else {
                    sent++
                    events.push({ day, to: recipient, eventId })
                }
            } catch (err) {
                failed++
                const message = err instanceof Error ? err.message : String(err)
                events.push({ day, to: recipient, eventId: null, error: message })
                console.error(`[onboarding-emails] day ${day} send threw`, err)
            }
        }
    }

    return NextResponse.json({ sent, failed, events })
}

function dayAgo(days: number): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - days)
    d.setUTCHours(0, 0, 0, 0)
    return d.toISOString()
}
