import Link from "next/link"

/**
 * Section 09 — Final CTA / Get Started (centered).
 * Double CTA per D6: Start free trial + Try Demo.
 * Light muted background distinguishes from above section. No gradient.
 */
export function FinalCTA() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-28 md:py-36 text-center">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Section 09 · Get Started
        </p>
        <h2 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
          Run your studio from one back-office.
        </h2>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
          14-day free trial. No card required. Built by a studio that needed it
          first.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Start free trial →
          </Link>
          <Link
            href="/demo"
            className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Try Demo
          </Link>
        </div>

        <p className="mt-10 text-sm text-muted-foreground leading-relaxed">
          Questions before signing up? Talk to the founder directly — we read
          every email.
        </p>
      </div>
    </section>
  )
}
