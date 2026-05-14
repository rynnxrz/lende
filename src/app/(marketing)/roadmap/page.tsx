import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Roadmap — lende",
  description: "What we're building now, what's next, and what's further out. Updated regularly.",
}

const columns = [
  {
    horizon: "Now",
    description: "Actively building. Expected within weeks.",
    items: [
      "Ivy data migration to lende",
      "Billing integration (Lemon Squeezy)",
      "Marketing site fill-out",
      "Invitation-based onboarding flow",
    ],
  },
  {
    horizon: "Next",
    description: "Scoped and planned. Expected within 1-2 months.",
    items: [
      "Custom catalog domain per org",
      "PDF Lookbook view",
      "Org-aware dashboard analytics",
      "Inventory Display Mode (per-item)",
      "Customer-facing storefront templates",
    ],
  },
  {
    horizon: "Later",
    description: "On the radar. Timing may shift.",
    items: [
      "API access for Atelier tier",
      "Webhooks for external integrations",
      "Multi-currency support",
      "Mobile admin app",
      "White-label storefront builder",
    ],
  },
]

export default function RoadmapPage() {
  return (
    <main>
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● Roadmap
          </p>
          <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-3xl">
            Where lende is headed.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            This roadmap reflects what we&apos;re actually building, not aspirational features.
            Items may slip — we prefer shipping right over shipping fast.
          </p>
        </div>
      </section>

      {/* Columns */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
          <div className="grid md:grid-cols-3 gap-8">
            {columns.map((col) => (
              <div key={col.horizon}>
                <div className="mb-6">
                  <h2 className="text-lg font-medium text-foreground">{col.horizon}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{col.description}</p>
                </div>
                <div className="space-y-3">
                  {col.items.map((item) => (
                    <div
                      key={item}
                      className="rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20 text-center">
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This roadmap is updated as priorities shift. Have a feature request?
            Email{" "}
            <a
              href="mailto:founder@shipbyx.com?subject=lende%20feature%20request"
              className="text-foreground hover:underline underline-offset-4"
            >
              founder@shipbyx.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  )
}
