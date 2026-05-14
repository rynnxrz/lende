import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/admin/Sidebar'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

/**
 * BRIEF-05 — Admin layout extended with:
 *   - EmailVerificationBanner (visible until email_confirmed_at is set)
 *   - OnboardingWizard (rendered only when ?onboarding=1, hydrated by
 *     reading organizations.settings.onboarding.step)
 *
 * The legacy single-tenant admin guard (`profiles.role = 'admin'`) is
 * preserved as the primary check; for the new per-org members table we
 * also accept `owner` / `admin` membership in the org resolved from the
 * `x-org-slug` header (set by middleware on tenant rewrites). This
 * keeps the IVYJSTUDIO production deployment working unchanged while
 * letting fresh signups land here.
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

    // Resolve org slug from middleware-injected header (BRIEF-03 path-
    // based routing). Falls back to no slug — legacy single-tenant case.
    const headerList = await headers()
    const orgSlug = headerList.get('x-org-slug')

    // Authorization — try per-org membership first; fall back to legacy.
    let isAuthorized = false
    let storeName: string | null = null
    let onboardingStep = 0
    let onboardingCompletedAt: string | null = null

    if (orgSlug) {
        const service = createServiceClient()
        const { data: org } = await service
            .from('organizations')
            .select('id, name, settings')
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
        <div className="min-h-screen bg-slate-100">
            {!isEmailVerified && user.email && (
                <EmailVerificationBanner email={user.email} />
            )}

            <Sidebar />

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
