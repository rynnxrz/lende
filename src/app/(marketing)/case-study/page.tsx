import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Case Study: IvyJSTUDIO — lende",
  description:
    "How a one-person jewelry rental studio in Auckland replaced spreadsheets, manual imports, and double-bookings with lende.",
}

const stats = [
  { label: "Reservation review", value: "5 → 1", note: "rounds reduced" },
  { label: "Pricing negotiation", value: "3 → 1", note: "review passes reduced" },
  { label: "Rental modes active", value: "3", note: "Rental + Wholesale + Retail" },
  { label: "Staff accounts", value: "1", note: "Solo studio" },
]

export default function CaseStudyPage() {
  return (
    <main>
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-4">
            ● Case study
          </p>
          <span className="inline-block rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 tracking-[0.05em] uppercase mb-8 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Draft
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-4xl">
            IvyJSTUDIO: from spreadsheets to one back-office.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            A one-person jewelry rental and wholesale studio in Auckland, New Zealand.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-light text-foreground">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xs text-muted-foreground/60">{stat.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground/60">
            Measured at IvyJSTUDIO Q1 2026, post-baseline (BRIEF-38)
          </p>
        </div>
      </section>

      {/* Before / After */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                Before lende
              </h2>
              <ul className="space-y-4">
                {[
                  "Rental tracking in Google Sheets — manual date checks, no availability view",
                  "Wholesale orders in a separate notebook — no connection to inventory",
                  "New supplier catalogs imported by hand — 2-3 hours per lookbook",
                  "Invoicing done manually in Google Docs — copy-paste item details each time",
                  "Double-bookings discovered only when items weren't on the shelf",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                    <span className="mt-1.5 block h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                After lende
              </h2>
              <ul className="space-y-4">
                {[
                  "Calendar-based availability — see what's rented, what's available, at a glance",
                  "Wholesale orders in the same system — shared inventory, no duplicates",
                  "Catalog import: paste a supplier URL, review staged items, publish in minutes",
                  "Automated invoices generated from reservation data",
                  "Double-bookings prevented by reservation system with approval gates",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                    <span className="mt-1.5 block h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* The studio */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
          <h2 className="text-2xl sm:text-3xl font-light text-foreground mb-8">
            About IvyJSTUDIO
          </h2>
          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed max-w-2xl">
            <p>
              IvyJSTUDIO is a jewelry and accessories studio based in Auckland, New Zealand,
              run by Ivy. The business operates across three channels: event rental, wholesale
              to retailers, and direct retail to individuals.
            </p>
            <p>
              As lende&apos;s first user and ongoing anchor case, IvyJSTUDIO shaped every feature
              in the product. The studio continues to run on lende as its primary back-office
              system.
            </p>
          </div>
          <a
            href="https://ivyjstudio.shipbyx.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Visit IvyJSTUDIO storefront
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-light text-foreground">
            Running a similar studio?
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">
            lende might be a fit. Request access and the founder will walk you through it.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Request access
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
