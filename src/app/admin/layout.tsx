import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/admin/Sidebar'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

/**
 * Admin layout for the root `/admin/*` route tree (default-org via
 * middleware rewrite from `/{DEFAULT_ORG}/admin/*`).
 *
 *   - EmailVerificationBanner (visible until email_confirmed_at is set)
 *   - OnboardingWizard (rendered only when ?onboarding=1, hydrated by
 *     reading organizations.settings.onboarding.step)
 *   - Sidebar with OrgSwitcher when org context is resolvable from the
 *     `x-org-slug` header. Mirrors the `[slug]/admin/layout.tsx` so
 *     the OrgSwitcher dropdown is consistent across both route trees.
 *
 * Authorization: per-org membership (owner/admin) is the primary path;
 * legacy `profiles.role === 'admin'` remains as a fallback so any
 * pre-multi-tenant admin user can still reach the page (the bare
 * <Sidebar /> branch handles that case without org context).
 */
export default async function AdminLayout({
    children,
    searchParams,
}: {
    children: React.ReactNode
    searchParams?: Promise<{ onboarding?: string }>
}) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        console.log('[AdminLayout] No user found, redirecting to login')
        redirect('/login')
    }

    // Resolve org slug from middleware-injected header (path-based
    // routing). Falls back to no slug — legacy single-tenant case.
    const headerList = await headers()
    const orgSlug = headerList.get('x-org-slug')

    // Authorization — try per-org membership first; fall back to legacy.
    let isAuthorized = false
    let storeName: string | null = null
    let onboardingStep = 0
    let onboardingCompletedAt: string | null = null

    // Org context for the Sidebar's OrgSwitcher. Only populated when the
    // per-org membership branch succeeds — the legacy fallback renders a
    // bare Sidebar (no OrgSwitcher).
    type RawMembership = {
        organization_id: string
        role: string
        organizations: { id: string; slug: string; name: string } | null
    }
    let currentOrg: { id: string; slug: string; name: string } | null = null
    let currentRole: string | null = null
    let memberships: RawMembership[] = []

    if (orgSlug) {
        const service = createServiceClient()
        const { data: org } = await service
            .from('organizations')
            .select('id, name, slug, settings')
            .eq('slug', orgSlug)
            .maybeSingle()
        if (org) {
            const { data: member } = await service
                .from('organization_members')
                .select('role')
                .eq('organization_id', org.id)
                .eq('user_id', user.id)
                .maybeSingle()
            if (member?.role === 'owner' || member?.role === 'admin') {
                isAuthorized = true
                storeName = (org.name as string) ?? orgSlug
                const settings = (org.settings ?? {}) as Record<string, unknown>
                const onboarding = (settings.onboarding ?? {}) as Record<string, unknown>
                onboardingStep = (onboarding.step as number) ?? 0
                onboardingCompletedAt = (onboarding.completed_at as string | null) ?? null

                currentOrg = {
                    id: org.id as string,
                    slug: org.slug as string,
                    name: (org.name as string) ?? orgSlug,
                }
                currentRole = member.role

                // Fetch every membership for the OrgSwitcher dropdown.
                // Service role bypasses the RLS that would otherwise
                // hide rows for orgs other than current_org_id.
                const { data: membershipsRaw } = await service
                    .from('organization_members')
                    .select('organization_id, role, organizations!inner(id, slug, name)')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: true })
                memberships = (membershipsRaw ?? []) as unknown as RawMembership[]
            }
        }
    }

    if (!isAuthorized) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
        if (profile?.role === 'admin') {
            isAuthorized = true
        }
    }

    if (!isAuthorized) {
        console.log('[AdminLayout] User is not authorized, redirecting')
        redirect('/')
    }

    const params = (await searchParams) ?? {}
    const showOnboarding = params.onboarding === '1' && !onboardingCompletedAt && !!orgSlug
    const isEmailVerified = user.email_confirmed_at != null

    return (
        <div className="min-h-screen bg-muted/30">
            {!isEmailVerified && user.email && (
                <EmailVerificationBanner email={user.email} />
            )}

            {currentOrg && currentRole ? (
                <Sidebar
                    currentOrg={currentOrg}
                    currentRole={currentRole}
                    memberships={memberships}
                />
            ) : (
                <Sidebar />
            )}

            {/*
              Desktop: Sidebar is fixed w-16, so main needs pl-16.
              Mobile: Sidebar is hidden (Sheet), so main is full width.
            */}
            <main className="min-h-screen w-full md:pl-16 transition-[padding] duration-300">
                <div className="p-4 md:p-8 pt-16 md:pt-8">
                    {children}
                </div>
            </main>

            {showOnboarding && orgSlug && (
                <OnboardingWizard
                    orgSlug={orgSlug}
                    storeName={storeName ?? orgSlug}
                    initialStep={onboardingStep > 0 ? onboardingStep : 1}
                />
            )}
        </div>
    )
}
