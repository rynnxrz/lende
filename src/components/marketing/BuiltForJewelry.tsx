import {
  CalendarDays,
  EyeOff,
  Camera,
  ShieldCheck,
} from "lucide-react"

/**
 * Section 07 — Built for jewelry & accessory studios (4 cards).
 *
 * Anchor lines from BRIEF-13 §3.2 (real product decisions, not generic
 * placeholders). Card 2 (Configurable Inventory Display Mode) carries
 * "COMING NEXT" outline pill — vaporware guard per planner 20:40 NOTE.
 */
export function BuiltForJewelry() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-24 md:py-32">
        <div className="max-w-2xl mb-16 md:mb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Section 07 · Built for the category
          </p>
          <h2 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
            Built for jewelry &amp; accessory studios.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Four workflow decisions extracted from a year of running a real
            luxury rental business.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={CalendarDays}
            title="Live Date-Aware Catalog"
            body="A shareable lookbook link that auto-filters available SKUs for the dates your stylist asks about."
            scenario="Before — 30 minutes editing a PDF lookbook in Illustrator. After — one shared link with a 2-day turnaround buffer baked in."
          />
          <FeatureCard
            icon={EyeOff}
            title="Configurable Inventory Display Mode"
            body="When a piece is already booked, you decide what the customer sees — hide it, show it as currently out, or surface a 'request anyway' button to your admin queue."
            scenario="Booqable forces one availability model store-wide. Per-item override means a 3D-print-capable studio can recover ~15% of conflict-date requests as made-to-order sales."
            badge="Coming next"
          />
          <FeatureCard
            icon={Camera}
            title="Embed Proof Collection"
            body="Every pickup and return logs photos against the order — no separate Drive folder, no 'I sent it to your WhatsApp last month' archaeology."
            scenario="Snap 4 photos at return time. Date-stamped, linked to SKU + order. If a damage dispute lands a month later, the evidence is already attached."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Fail-Safe Request Capture"
            body="Stylist submissions never get dropped — idempotency keys, local backup, restore codes. A flaky Paris hotel WiFi mid-form doesn't lose the booking."
            scenario="Form completion rate jumped 35% → 85%+ once we shipped restore codes. For high-value pieces, 'form crashed' is not an acceptable failure mode."
          />
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  scenario,
  badge,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  body: string
  scenario: string
  badge?: string
}) {
  return (
    <div className="relative rounded-md border border-border bg-background p-7 flex flex-col">
      {badge && (
        <span className="absolute top-4 right-4 inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground bg-background">
          {badge}
        </span>
      )}
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <h3 className="mt-6 text-base font-medium text-foreground leading-snug">
        {title}
      </h3>
      <p className="mt-3 text-sm text-foreground/80 leading-relaxed">{body}</p>
      <p className="mt-4 text-sm italic text-muted-foreground leading-relaxed">
        {scenario}
      </p>
    </div>
  )
}
