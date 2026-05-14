import Link from 'next/link'

/**
 * BRIEF-48 step 2 — Studio details (canonical reference, default-skipped).
 *
 * Per BRIEF-46 critique line 67, S2 ("Studio details") is a canonical 5-step
 * reference screen, not on the user path. Wizard auto-forwards step 1 → step 3.
 * This page renders only when navigated to directly.
 */
export default function OnboardingStep2Page() {
    return (
        <main className="relative min-h-screen bg-background">
            <ProgressBar current={2} required />

            <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                <div className="max-w-xl mx-auto">
                    <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                        ● Studio details
                    </p>
                    <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground">
                        Confirm your studio name and URL.
                    </h1>
                    <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                        We pre-fill these from your invitation. You can change them now or
                        any time later from settings.
                    </p>

                    <div className="mt-10 space-y-4">
                        <div className="rounded-md border border-border bg-card p-4">
                            <p className="text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
                                Studio name
                            </p>
                            <p className="mt-2 text-base text-foreground">From your invitation</p>
                        </div>
                        <div className="rounded-md border border-border bg-card p-4">
                            <p className="text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
                                URL slug
                            </p>
                            <p className="mt-2 font-mono text-sm text-foreground">
                                /your-slug
                            </p>
                        </div>
                    </div>

                    <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                        <Link
                            href="/onboarding/step-3"
                            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        >
                            Continue to tour
                        </Link>
                        <Link
                            href="/onboarding/step-1"
                            className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                            Back
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
