import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Pricing — lende",
  description:
    "Pricing built for independent studios. Solo, Studio, and Atelier tiers. Invitation-only early access.",
}

// M-06: Product + Offer schema for pricing page.
const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "lende",
  description:
    "Operating system for jewelry and accessory studios.",
  brand: {
    "@type": "Brand",
    name: "lende",
  },
  offers: [
    {
      "@type": "Offer",
      name: "Solo",
      price: "19",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://lende.shipbyx.com/pricing#solo",
    },
    {
      "@type": "Offer",
      name: "Studio",
      price: "49",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://lende.shipbyx.com/pricing#studio",
    },
    {
      "@type": "Offer",
      name: "Atelier",
      price: "129",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://lende.shipbyx.com/pricing#atelier",
    },
  ],
}

const tiers = [
  {
    name: "Solo",
    price: "$19",
    period: "/mo",
    description: "For one-person studios getting started with rental or wholesale.",
    features: [
      "1 staff account",
      "Up to 200 items",
      "Rental + wholesale modes",
      "Catalog import (10/mo)",
      "Email support",
    ],
    cta: "Request access",
    highlighted: false,
  },
  {
    name: "Studio",
    price: "$49",
    period: "/mo",
    description: "For growing studios that need team access and higher limits.",
    features: [
      "Up to 5 staff accounts",
      "Unlimited items",
      "Rental + wholesale + retail modes",
      "Catalog import (50/mo)",
      "Priority email support",
      "Custom catalog domain",
    ],
    cta: "Request access",
    highlighted: true,
  },
  {
    name: "Atelier",
    price: "$129",
    period: "/mo",
    description: "For established studios with complex workflows and high volume.",
    features: [
      "Unlimited staff accounts",
      "Unlimited items",
      "All modes + API access",
      "Catalog import (unlimited)",
      "Dedicated support",
      "Custom catalog domain",
      "Priority feature requests",
    ],
    cta: "Request access",
    highlighted: false,
  },
]

const compareRows = [
  { feature: "Staff accounts", solo: "1", studio: "5", atelier: "Unlimited" },
  { feature: "Item limit", solo: "200", studio: "Unlimited", atelier: "Unlimited" },
  { feature: "Rental mode", solo: true, studio: true, atelier: true },
  { feature: "Wholesale mode", solo: true, studio: true, atelier: true },
  { feature: "Retail mode", solo: false, studio: true, atelier: true },
  { feature: "Catalog import", solo: "10/mo", studio: "50/mo", atelier: "Unlimited" },
  { feature: "Custom domain", solo: false, studio: true, atelier: true },
  { feature: "API access", solo: false, studio: false, atelier: true },
  { feature: "Priority support", solo: false, studio: true, atelier: true },
  { feature: "Priority features", solo: false, studio: false, atelier: true },
]

const faqItems = [
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrade or downgrade at any time. Changes take effect on your next billing cycle.",
  },
  {
    q: "How do I get access?",
    a: "lende is invitation-only during early access. Request an invite and we'll set up your workspace within 24 hours.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards through our payment provider, Lemon Squeezy. Invoices available for annual plans.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes. Cancel anytime from your account settings. Your workspace stays accessible until the end of your billing period.",
  },
  {
    q: "Do you offer annual pricing?",
    a: "Annual plans are coming soon with a discount. Contact us if you'd like to be notified.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "Your data is retained for 30 days after cancellation. You can export everything at any time.",
  },
]

export default function PricingPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }}
      />
      {/* Hero */}
      <section className="relative">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● Pricing · 2026
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-3xl">
            Pricing built for independent studios.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl">
            No card required · Cancel anytime
          </p>
        </div>
      </section>

      {/* Tier cards */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-lg border p-8 flex flex-col ${
                  tier.highlighted
                    ? "border-foreground bg-background shadow-sm"
                    : "border-border bg-background"
                }`}
              >
                {tier.highlighted && (
                  <p className="text-xs font-medium tracking-[0.2em] uppercase text-foreground mb-4">
                    Most popular
                  </p>
                )}
                <h3 className="text-lg font-medium text-foreground">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-light text-foreground">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {tier.description}
                </p>
                <ul className="mt-8 space-y-3 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-foreground">
                      <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-foreground shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${
                    tier.highlighted
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "border border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground tracking-[0.05em]">
            Charged in your local currency at checkout. USD shown for reference. Tax may apply depending on your region.
          </p>
        </div>
      </section>

      {/* Compare table */}
      <section className="scroll-mt-20">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <h2 className="text-2xl sm:text-3xl font-light text-foreground mb-10">
            Compare plans
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 pr-4 font-medium text-foreground w-1/4">Feature</th>
                  <th className="text-center py-3 px-4 font-medium text-foreground w-1/4">Solo</th>
                  <th className="text-center py-3 px-4 font-medium text-foreground w-1/4">Studio</th>
                  <th className="text-center py-3 px-4 font-medium text-foreground w-1/4">Atelier</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.feature} className="border-b border-border/50">
                    <td className="py-3 pr-4 text-muted-foreground">{row.feature}</td>
                    {[row.solo, row.studio, row.atelier].map((val, i) => (
                      <td key={i} className="py-3 px-4 text-center text-foreground">
                        {typeof val === "boolean" ? (val ? "●" : "—") : val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <h2 className="text-2xl sm:text-3xl font-light text-foreground mb-10">
            Common questions
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {faqItems.map((item) => (
              <div key={item.q}>
                <h3 className="text-sm font-medium text-foreground">{item.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder CTA */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-light text-foreground">
                Not sure which plan fits?
              </h2>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
                Book a 15-minute call with the founder. No sales pitch — just an honest look at
                whether lende is right for your studio.
              </p>
            </div>
            <div className="flex md:justify-end">
              <a
                href="mailto:founder@shipbyx.com?subject=lende%20pricing%20question"
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
