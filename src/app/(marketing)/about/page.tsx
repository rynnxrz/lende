import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About — lende",
  description:
    "lende is built by Rongze, an independent developer in Auckland, New Zealand. Born from a real jewelry rental studio.",
}

// M-06: Organization schema (ShipByX Ltd / founder Rongze).
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ShipByX Ltd",
  alternateName: "lende",
  url: "https://lende.shipbyx.com",
  logo: "https://lende.shipbyx.com/marketing/og-image.png",
  description:
    "Independent software studio building lende, an operating system for jewelry and accessory studios.",
  founder: {
    "@type": "Person",
    name: "Rongze",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Auckland",
    addressCountry: "NZ",
  },
  email: "founder@shipbyx.com",
}

const philosophy = [
  {
    title: "Small",
    description:
      "lende is built for studios with 1–10 people. The product will never pivot to serve enterprises. Features are designed for the constraints of small teams, not scaled-down versions of enterprise workflows.",
  },
  {
    title: "Slow",
    description:
      "No growth hacking, no VC pressure, no sprint to 10,000 users. Each new studio gets personal onboarding. The founder answers support emails. Quality over speed, always.",
  },
  {
    title: "On purpose",
    description:
      "Every feature exists because a real studio needed it. Catalog import was built because Ivy spent hours copy-pasting from supplier websites. Wholesale mode was built because she started doing trade shows. Nothing is speculative.",
  },
]

export default function AboutPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● About
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-4xl">
            Built from a real studio, for real studios.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            lende started as the back-office for one jewelry rental studio in Auckland.
            It&apos;s becoming a product because no one else is building for this niche.
          </p>
        </div>
      </section>

      {/* Founder section */}
      <section id="founder" className="scroll-mt-20 bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
                Founder
              </p>
              <h2 className="text-3xl sm:text-4xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
                Rongze
              </h2>
              <div className="mt-6 space-y-4 text-sm text-muted-foreground leading-relaxed max-w-lg">
                <p>
                  I&apos;m an independent developer based in Auckland, New Zealand. My partner Ivy
                  runs a jewelry rental and wholesale studio — IvyJSTUDIO — and she needed
                  software that didn&apos;t exist.
                </p>
                <p>
                  Shopify doesn&apos;t do rentals. Rental platforms don&apos;t do wholesale. Nothing
                  handles both, let alone the niche workflows of a small accessories studio.
                  So I built it.
                </p>
                <p>
                  lende is that system, turned into a product. It&apos;s still early — Ivy is
                  still the primary user, and I&apos;m still the only developer. But if your
                  studio has the same problem, it might work for you too.
                </p>
              </div>
              <a
                href="mailto:founder@shipbyx.com"
                className="mt-8 inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                founder@shipbyx.com
              </a>
            </div>
            <div className="aspect-square rounded-md border border-border bg-muted/40 flex items-center justify-center">
              <span className="text-xs font-mono tracking-[0.1em] uppercase text-muted-foreground">
                Founder photo
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Origin story — Ivy */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-6">
            Origin
          </p>
          <h2 className="text-3xl sm:text-4xl font-light tracking-[0.02em] leading-[1.15] text-foreground max-w-3xl">
            IvyJSTUDIO: where lende started.
          </h2>
          <div className="mt-6 space-y-4 text-sm text-muted-foreground leading-relaxed max-w-2xl">
            <p>
              Ivy runs a jewelry and accessories studio in Auckland. Rental for events, wholesale
              for retailers, retail for individuals. Three business models, one inventory.
            </p>
            <p>
              Before lende, she used spreadsheets for rental tracking, a separate system for
              wholesale orders, and manual invoicing. It worked until it didn&apos;t — double bookings,
              lost track of who had what, and hours spent importing new supplier catalogs by hand.
            </p>
            <p>
              lende replaced all of that. Ivy is still the first user, the most demanding tester,
              and the reason every feature exists.
            </p>
          </div>
          <Link
            href="/case-study"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Read the IvyJSTUDIO case study
          </Link>
        </div>
      </section>

      {/* Philosophy */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
          <h2 className="text-2xl sm:text-3xl font-light text-foreground mb-12">
            Three constraints
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {philosophy.map((item) => (
              <div key={item.title}>
                <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-light text-foreground">
            Interested?
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">
            lende is invitation-only during early access. Request an invite to get started.
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
