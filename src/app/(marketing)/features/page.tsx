import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Features — lende",
  description:
    "Four modes in one back-office: Rental, Wholesale, Retail, and Catalog Import. One source of truth for items, orders, and customers.",
}

// M-06: SoftwareApplication schema enriched with feature list.
const featuresSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "lende",
  url: "https://lende.shipbyx.com/features",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  featureList: [
    "Rental management with calendar availability",
    "Wholesale order management with tiered pricing",
    "Retail point-of-sale with stock sync",
    "Smart catalog import from URLs and PDFs",
  ],
}

const modes = [
  {
    number: "01",
    name: "Rental",
    headline: "Track who has what, when it's due back, and what's available.",
    bullets: [
      "Calendar-based availability for every item",
      "Reservation workflow with approval gates",
      "Automated invoice generation on return",
      "Damage and condition tracking per rental",
    ],
  },
  {
    number: "02",
    name: "Wholesale",
    headline: "Manage bulk orders, trade pricing, and B2B relationships.",
    bullets: [
      "Tiered wholesale price lists per customer group",
      "Bulk order management with line-item tracking",
      "Lookbook generation for trade shows",
      "Payment terms and aging reports",
    ],
  },
  {
    number: "03",
    name: "Retail",
    headline: "Sell directly to customers with a catalog they can browse.",
    bullets: [
      "Public catalog with category filtering",
      "Per-item or variant-level pricing",
      "Order and payment confirmation flow",
      "Inventory sync across all three modes",
    ],
  },
  {
    number: "04",
    name: "Catalog Import",
    headline: "Paste a URL. Get structured inventory in minutes, not hours.",
    bullets: [
      "Accepts supplier websites and lookbook PDFs",
      "AI extracts: name, category, variants, images, price, weight",
      "Staging table for human review before publish",
      "Batch approve, edit, or reject with one click",
    ],
  },
]

export default function FeaturesPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(featuresSchema) }}
      />
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● Features · 4 modes
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-4xl">
            Four ways to run your studio. One back-office.
          </h1>
        </div>
      </section>

      {/* Mode anchor strip */}
      <section className="border-y border-border/60 sticky top-16 z-40 bg-background/80 backdrop-blur-md">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
          <div className="flex gap-6 sm:gap-10 overflow-x-auto py-3 text-xs font-medium tracking-[0.15em] uppercase text-muted-foreground">
            {modes.map((m) => (
              <a
                key={m.name}
                href={`#mode-${m.name.toLowerCase().replace(" ", "-")}`}
                className="shrink-0 hover:text-foreground transition-colors"
              >
                ● {m.name}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Mode blocks */}
      {modes.map((mode, i) => (
        <section
          key={mode.name}
          id={`mode-${mode.name.toLowerCase().replace(" ", "-")}`}
          className={`scroll-mt-28 ${i % 2 === 1 ? "bg-muted/30" : ""}`}
        >
          <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                  Mode {mode.number} · {mode.name}
                </p>
                <h2 className="text-3xl sm:text-4xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
                  {mode.headline}
                </h2>
                <ul className="mt-8 space-y-4">
                  {mode.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                      <span className="mt-1.5 block h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="aspect-[4/3] rounded-md border border-border bg-muted/40 flex items-center justify-center">
                <span className="text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground">
                  {mode.name} screenshot
                </span>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Shared data diagram */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-light tracking-[0.02em] text-foreground">
            One source of truth. Four ways to read it.
          </h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-lg mx-auto">
            Items, orders, and customers live in one database. Every mode reads and writes
            the same records — no sync, no duplicates, no drift.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            {["Items", "Orders", "Customers"].map((node) => (
              <div
                key={node}
                className="rounded-md border border-border bg-background px-6 py-4 text-sm font-medium text-foreground"
              >
                {node}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-light text-foreground">
            See it on real data.
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Try the demo with a sample studio — no signup required.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Open demo workspace
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Request access
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
