import Link from "next/link"

/**
 * Section 08 — Pricing (3 tiers).
 * D4 not yet locked → "Contact for pricing" placeholder (per planner spec).
 * Pro tier is RECOMMENDED with 2px border emphasis (NOT background tint —
 * design rationale: tint reads as "ad", border-emphasis reads as "the
 * spec'd default").
 */
export function Pricing() {
  return (
    <section id="pricing" className="border-t border-border">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-24 md:py-32">
        <div className="max-w-2xl mb-16 md:mb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Section 08 · Pricing
          </p>
          <h2 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
            Pricing
          </h2>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Three plans. One independent maker. Final pricing locked after our
            first cohort of customers — talk to us until then.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          <Tier
            name="Starter"
            tagline="For solo studios just getting off Excel."
            bullets={[
              "Single user",
              "All rental + retail workflows",
              "14-day free trial",
              "2 catalog import scans / month",
            ]}
            ctaLabel="Talk to us"
            ctaHref="/contact"
            ctaVariant="outline"
          />
          <Tier
            name="Pro"
            tagline="For working studios serializing high-value pieces."
            bullets={[
              "Up to 5 users",
              "Wholesale + B2B order workflows",
              "Catalog import included (20 scans / month)",
              "Photo proof + condition tracking",
              "14-day free trial",
            ]}
            ctaLabel="Request access"
            ctaHref="/signup"
            ctaVariant="primary"
            recommended
          />
          <Tier
            name="Studio"
            tagline="For multi-location operators with custom needs."
            bullets={[
              "Unlimited users",
              "Multi-org / multi-location",
              "Catalog import included (100 scans / month)",
              "Custom prompt + multi-model AI",
              "Custom workflow integrations (scoped quote)",
            ]}
            ctaLabel="Talk to us"
            ctaHref="/contact"
            ctaVariant="outline"
          />
        </div>

        <p className="mt-12 text-sm text-muted-foreground leading-relaxed max-w-3xl">
          All plans include the 14-day free trial. No card required to try.
          Pricing locks after our first 20 customers — early adopters keep their
          tier price for 12 months.
        </p>
      </div>
    </section>
  )
}

function Tier({
  name,
  tagline,
  bullets,
  ctaLabel,
  ctaHref,
  ctaVariant,
  recommended,
}: {
  name: string
  tagline: string
  bullets: string[]
  ctaLabel: string
  ctaHref: string
  ctaVariant: "primary" | "outline"
  recommended?: boolean
}) {
  return (
    <div
      className={`relative rounded-md bg-background p-8 flex flex-col ${
        recommended
          ? "border-2 border-foreground"
          : "border border-border p-[33px]"
      }`}
    >
      {recommended && (
        <span className="absolute -top-3 left-8 inline-flex items-center rounded-full bg-foreground px-3 py-1 text-[10px] font-medium tracking-[0.2em] uppercase text-background">
          Recommended
        </span>
      )}
      <h3 className="text-xl font-medium text-foreground tracking-[0.05em]">
        {name}
      </h3>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed min-h-[2.5em]">
        {tagline}
      </p>
      <p className="mt-8 font-mono text-sm tracking-[0.05em] text-muted-foreground">
        Contact for pricing
      </p>

      <ul className="mt-8 space-y-3 grow">
        {bullets.map((b) => (
          <li
            key={b}
            className="flex gap-2.5 text-sm text-foreground/85 leading-relaxed"
          >
            <span
              aria-hidden
              className="mt-2 inline-block h-px w-3 shrink-0 bg-border"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`mt-10 inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${
          ctaVariant === "primary"
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border bg-background text-foreground hover:bg-muted transition-colors"
        }`}
      >
        {ctaLabel}
      </Link>
    </div>
  )
}
