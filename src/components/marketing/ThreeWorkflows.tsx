import { CalendarRange, Truck, ShoppingBag } from "lucide-react"

/**
 * Three Workflows section — Rental / Wholesale / Retail.
 * Per stage-1 spec: 3 columns desktop / 1 column mobile, thin border, no shadow.
 */
export function ThreeWorkflows() {
  return (
    <section className="border-t border-border">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-24 md:py-32">
        <div className="max-w-2xl mb-16 md:mb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            03 / Three Workflows
          </p>
          <h2 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
            One catalog. Three businesses.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <WorkflowCard
            icon={CalendarRange}
            title="Rental"
            tagline="Track availability and condition by serial, not just SKU."
            bullets={[
              "Deposit handling and refunds",
              "Condition check on every return",
              "Damage workflow with photo proof",
              "Customer history and repeat bookings",
            ]}
          />
          <WorkflowCard
            icon={Truck}
            title="Wholesale"
            tagline="Run B2B orders without a CSV bridge to a separate system."
            bullets={[
              "Tiered pricing for stylists and partners",
              "PO + invoice + shipping in one place",
              "Shipping tracking and proof of delivery",
              "Repeat-order shortcuts for recurring clients",
            ]}
          />
          <WorkflowCard
            icon={ShoppingBag}
            title="Retail"
            tagline="Sell directly from the same catalog your wholesale clients see."
            bullets={[
              "Catalog page with shareable links",
              "Card payment and order confirmation",
              "Fulfillment status visible to customer",
              "Returns merge into rental condition pipeline",
            ]}
          />
        </div>
      </div>
    </section>
  )
}

function WorkflowCard({
  icon: Icon,
  title,
  tagline,
  bullets,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  tagline: string
  bullets: string[]
}) {
  return (
    <div className="rounded-md border border-border bg-background p-8 flex flex-col">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <h3 className="mt-6 text-xl font-light tracking-[0.05em] text-foreground">
        {title}
      </h3>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
        {tagline}
      </p>
      <ul className="mt-6 space-y-2.5">
        {bullets.map((b) => (
          <li
            key={b}
            className="flex gap-2.5 text-sm text-foreground/80 leading-relaxed"
          >
            <span
              aria-hidden
              className="mt-2 inline-block h-px w-3 shrink-0 bg-border"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
