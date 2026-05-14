import Link from "next/link"

/**
 * Hero section.
 * Locked to variant A per planner 2026-05-02 11:30 verify (Rongze 锁 Hero A).
 * A/B toggle removed 2026-05-05 per Rongze instruction.
 *
 * Hero copy avoids "AI" — feature details land in dedicated pages.
 * Double CTA per D6: "Start free trial" (primary) + "Try Demo" (secondary).
 */
export function Hero() {
  return (
    <section className="relative">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
        {/* Eyebrow */}
        <div className="mb-12 md:mb-16">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            01 / Today
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div className="lg:col-span-7 max-w-2xl">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-[0.02em] leading-[1.1] text-foreground">
              Run rental, wholesale, and retail from one back-office.
            </h1>
            <p className="mt-6 text-lg sm:text-xl font-normal text-muted-foreground leading-relaxed max-w-xl">
              Built for studios that don&apos;t fit a Shopify template.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Start free trial
              </Link>
              <Link
                href="/demo"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Try Demo
              </Link>
            </div>

            <p className="mt-6 text-xs text-muted-foreground tracking-[0.05em]">
              14-day free trial · No card required
            </p>
          </div>

          {/* Product screenshot placeholder */}
          <div className="lg:col-span-5">
            <ProductScreenshotPlaceholder />
          </div>
        </div>
      </div>
    </section>
  )
}

function ProductScreenshotPlaceholder() {
  return (
    <div className="relative aspect-[4/3] w-full rounded-md border border-border bg-muted/40 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0, transparent 12px, rgba(125, 135, 155, 0.05) 12px, rgba(125, 135, 155, 0.05) 13px)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground">
          Product screenshot placeholder
        </span>
      </div>
    </div>
  )
}
