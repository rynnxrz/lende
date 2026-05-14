import Link from 'next/link'

/**
 * BRIEF-48 step 1 — Accept invitation (S1 wizard mirror page).
 *
 * The actual invitation acceptance happens at /invite/[token] (existing route,
 * BRIEF-44 phase A). This page is the wizard sequencer's nominal "step 1" entry
 * for users who land on /onboarding directly without a token — it explains what
 * the 5-step flow is and points back to the invitation link.
 */
export default function OnboardingStep1Page() {
    return (
        <main className="relative min-h-screen bg-background">
            <ProgressBar current={1} required />

            <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                <div className="max-w-xl mx-auto">
                    <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                        ● You&apos;re invited
                    </p>
                    <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground">
                        Set your password and step in.
                    </h1>
                    <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                        lende onboarding takes about five minutes — accept your invitation,
                        tour your workspace, add a first listing, then share with your team.
                    </p>

                    <div className="mt-10 rounded-md border border-border bg-card p-6">
                        <p className="text-sm text-muted-foreground">
                            If your administrator sent you an invitation email, open the
                            link in that email to continue. The link looks like{' '}
                            <code className="text-xs font-mono text-foreground">
                                /invite/&lt;token&gt;
                            </code>
                            .
                        </p>
                        <p className="mt-4 text-xs text-muted-foreground">
                            We&apos;ll never email you a password reset without your action.
                        </p>
                    </div>

                    <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                        <Link
                            href="/onboarding/step-2"
                            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Continue to studio details
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                            I already have an account
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    )
}

function ProgressBar({ current, required }: { current: number; required?: boolean }) {
    return (
        <div className="border-b border-border bg-background">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-8 h-12 flex items-center justify-between">
                <span className="text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
                    Step {current} of 5
                </span>
                {required ? (
                    <span className="text-xs font-medium tracking-[0.15em] uppercase text-foreground">
                        Required
                    </span>
                ) : null}
            </div>
        </div>
    )
}
