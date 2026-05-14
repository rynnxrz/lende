import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Step4Choice } from './step-4-choice'

/**
 * BRIEF-48 step 4 — Add first listing (S4 + S5).
 *
 * 3-card grid:
 *   A · primary · "Use sample data" → seedSampleAction → /<slug>/admin/listings
 *   B · "Add manually" → /<slug>/admin/listings/new
 *   C · disabled · "Import from PDF · Coming soon"
 */
export default async function OnboardingStep4Page() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login?next=/onboarding/step-4')
    }

    const currentOrgId = user.app_metadata?.current_org_id as string | undefined
    if (!currentOrgId) {
        redirect('/onboarding/step-1')
    }

    const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', currentOrgId)
        .single()

    if (!org?.slug) {
        redirect('/onboarding/step-1')
    }

    return (
        <main className="relative min-h-screen bg-background">
            <ProgressBar current={4} />

            <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                <div className="max-w-3xl mx-auto">
                    <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                        ● Listings
                    </p>
                    <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground">
                        Add your first listing.
                    </h1>
                    <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
                        Pick the fastest path. You can always add or remove listings later.
                    </p>

                    <Step4Choice
                        organizationId={currentOrgId}
                        orgSlug={org.slug}
                    />

                    <div className="mt-10 flex">
                        <Link
                            href={`/${org.slug}/admin`}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Skip for now →
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    )
}

function ProgressBar({ current }: { current: number }) {
    return (
        <div className="border-b border-border bg-background">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-8 h-12 flex items-center justify-between">
                <span className="text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
                    Step {current} of 5
                </span>
            </div>
        </div>
    )
}
