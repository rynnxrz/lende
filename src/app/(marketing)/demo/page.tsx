import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Demo — lende",
  description:
    "Try lende on a sample studio. No signup required. Explore rental, wholesale, and catalog import with pre-loaded data.",
}

const dataCards = [
  {
    label: "Rental",
    description: "Browse availability, create reservations, and generate invoices for a sample jewelry collection.",
  },
  {
    label: "Wholesale",
    description: "View trade pricing tiers, manage bulk orders, and generate lookbooks.",
  },
  {
    label: "Catalog Import",
    description: "Paste a supplier URL and watch AI extract structured inventory into a staging table.",
  },
]

export default function DemoPage() {
  return (
    <main>
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● Demo · Sandbox
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-3xl">
            Try lende on a sample studio.
          </h1>
          <p className="mt-4 inline-block rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground tracking-[0.1em] uppercase">
            No signup required
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Open demo workspace
            </Link>
            <a
              href="#walkthrough"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Watch 3-min walkthrough
            </a>
          </div>
        </div>
      </section>

      {/* Sandbox preview */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <div className="aspect-[16/10] rounded-lg border border-border bg-background flex items-center justify-center">
            <span className="text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground">
              Demo sandbox preview
            </span>
          </div>
        </div>
      </section>

      {/* Data cards */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <div className="grid md:grid-cols-3 gap-6">
            {dataCards.map((card) => (
              <div key={card.label} className="rounded-lg border border-border p-6">
                <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-3">
                  Data · {card.label}
                </p>
                <p className="text-sm text-foreground leading-relaxed">
                  {card.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Walkthrough video */}
      <section id="walkthrough" className="scroll-mt-20 bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <h2 className="text-2xl sm:text-3xl font-light text-foreground mb-8">
            3-minute walkthrough
          </h2>
          <div className="aspect-video rounded-lg border border-border bg-background flex items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-muted/40">
                <span className="text-xl text-muted-foreground">▶</span>
              </div>
              <span className="text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground">
                Video placeholder
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Founder CTA */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-light text-foreground">
                Want a guided walkthrough?
              </h2>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
                Book a 15-minute call. The founder will walk you through lende with your
                actual inventory in mind.
              </p>
            </div>
            <div className="flex md:justify-end">
              <a
                href="mailto:founder@shipbyx.com?subject=lende%20demo%20walkthrough"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                founder@shipbyx.com
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
