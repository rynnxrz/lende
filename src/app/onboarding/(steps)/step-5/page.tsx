import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ShareWithTeam } from '@/components/onboarding/ShareWithTeam'

/**
 * BRIEF-48 step 5 — Share with team (S6 + S7).
 *
 * Re-uses the existing <ShareWithTeam> component (BRIEF-44 phase A) so this
 * page is the wizard's terminal frame. After "Send invite" or "Skip for now"
 * the user is sent to the dashboard.
 */
export default async function OnboardingStep5Page() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login?next=/onboarding/step-5')
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
            <ProgressBar current={5} />

            <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                <div className="max-w-2xl mx-auto">
                    <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                        ● Team
                    </p>
                    <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground">
                        Share with your team.
                    </h1>
                    <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                        Invite teammates so reservations and listings stay in one place.
                        You can always invite more from settings later.
                    </p>

                    <div className="mt-10">
                        <ShareWithTeam organizationId={currentOrgId} />
                    </div>

                    <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                        <Link
                            href={`/${org.slug}/admin`}
                            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Finish — go to dashboard
                        </Link>
                        <Link
                            href={`/${org.slug}/admin`}
                            className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                            Skip for now
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
