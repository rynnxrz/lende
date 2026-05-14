import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SystemAdminClient, type Org, type TrialOrg } from './system-admin-client'
import { fetchEngagementScores } from './actions'

export const dynamic = 'force-dynamic'

const SYSTEM_ADMIN_EMAILS = new Set([
    'rongze.work@gmail.com',
])

export default async function SystemAdminOrgsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email || !SYSTEM_ADMIN_EMAILS.has(user.email)) {
        redirect('/login')
    }

    const service = createServiceClient()

    // 1) Full org list (used by "All" tab + create-org form)
    const { data: orgsRaw } = await service
        .from('organizations')
        .select('id, slug, name, plan, trial_ends_at, subscription_status, subscription_id, created_at')
        .order('created_at', { ascending: false })

    const orgs: Org[] = (orgsRaw ?? []).map(o => ({
        id: o.id,
        slug: o.slug,
        name: o.name,
        plan: o.plan,
        trialEndsAt: o.trial_ends_at,
        subscriptionStatus: o.subscription_status,
        subscriptionId: o.subscription_id,
        createdAt: o.created_at,
    }))

    // 2) "Active Trials" tab data — trialing or NULL status, within
    //    90 days of trial_ends_at (so just-expired orgs still show
    //    until the deactivate / archive cron picks them up).
    const trialIds = orgs
        .filter(o =>
            o.subscriptionStatus === null
            || o.subscriptionStatus === 'trialing'
        )
        .map(o => o.id)

    const scores = await fetchEngagementScores(trialIds)

    // 3) Fetch raw signals (items / reservations / team / last_active)
    //    for the trial-tab orgs in parallel. We only render counts so
    //    a single round-trip per org is fine.
    const trialSignals = await Promise.all(
        trialIds.map(async id => {
            const [itemsRes, reservationsRes, teamRes, lastActiveRes] = await Promise.all([
                service
                    .from('items')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', id),
                service
                    .from('reservations')
                    .select('id', { count: 'exact', head: true })
                    .eq('organization_id', id),
                service
                    .from('organization_members')
                    .select('user_id', { count: 'exact', head: true })
                    .eq('organization_id', id),
                service
                    .from('organization_members')
                    .select('user_id, profiles!inner(last_active_at)')
                    .eq('organization_id', id)
                    .order('profiles(last_active_at)', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
            ])
            const lastActiveAt = (lastActiveRes.data as unknown as
                { profiles?: { last_active_at?: string | null } | null } | null
            )?.profiles?.last_active_at ?? null
            return {
                id,
                itemsCount: itemsRes.count ?? 0,
                reservationsCount: reservationsRes.count ?? 0,
                teamSize: teamRes.count ?? 1,
                lastActiveAt,
            }
        })
    )
    const signalsById = new Map(trialSignals.map(s => [s.id, s]))

    const trials: TrialOrg[] = orgs
        .filter(o => trialIds.includes(o.id))
        .map(o => {
            const sig = signalsById.get(o.id)
            return {
                id: o.id,
                slug: o.slug,
                name: o.name,
                plan: o.plan,
                trialEndsAt: o.trialEndsAt,
                subscriptionStatus: o.subscriptionStatus,
                createdAt: o.createdAt,
                engagementScore: scores[o.id] ?? 0,
                itemsCount: sig?.itemsCount ?? 0,
                reservationsCount: sig?.reservationsCount ?? 0,
                teamSize: sig?.teamSize ?? 1,
                lastActiveAt: sig?.lastActiveAt ?? null,
            }
        })

    // 4) Owner email lookup for trial-tab orgs (for personal-email mailto:).
    //    One round-trip per org but bounded by trial pool size.
    const ownerByOrg = await Promise.all(
        trialIds.map(async id => {
            const { data } = await service
                .from('organization_members')
                .select('user_id, profiles!inner(email, full_name)')
                .eq('organization_id', id)
                .eq('role', 'owner')
                .limit(1)
                .maybeSingle()
            const profile = (data as unknown as
                { profiles?: { email?: string | null; full_name?: string | null } | null } | null
            )?.profiles
            return {
                id,
                ownerEmail: profile?.email ?? null,
                ownerName: profile?.full_name ?? null,
            }
        })
    )
    const ownerByOrgMap = Object.fromEntries(
        ownerByOrg.map(o => [o.id, { email: o.ownerEmail, name: o.ownerName }])
    )

    return (
        <SystemAdminClient
            orgs={orgs}
            trials={trials}
            ownerByOrg={ownerByOrgMap}
        />
    )
}
