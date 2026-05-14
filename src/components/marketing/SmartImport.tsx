/**
 * Section 06 — Catalog Import (Pro-only power feature).
 * Currently unused on home page (D10 v2 removed from marketing).
 * Kept for BRIEF-39 PDF Lookbook view reuse.
 */
export function SmartImport() {
  return (
    <section id="features" className="border-t border-border">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-24 md:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left — terminal console */}
          <SmartImportConsole />

          {/* Right — copy */}
          <div className="lg:pt-4">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Section 06 · Catalog Import
            </p>
            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
                Catalog Import
              </h2>
              <span className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">
                Available on Pro
              </span>
            </div>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-xl">
              Paste a supplier URL. Get a reviewable rental catalog draft in 10
              minutes.
            </p>

            <ol className="mt-12 space-y-8 max-w-xl">
              <Step
                number="01"
                title="Paste any supplier link"
                body="Squarespace, Shopify, Cargo, custom CMS. Lookbook PDF or Pinterest link works too."
              />
              <Step
                number="02"
                title="AI extracts the category tree"
                body="You pick which categories to scan, skip the rest."
              />
              <Step
                number="03"
                title="Per-category extraction lands in staging"
                body="Variants, weights, prices, descriptions, photos — all parsed against rental schema."
              />
              <Step
                number="04"
                title="Review, edit, commit batch"
                body="Or rollback the whole import if something's off."
              />
            </ol>

            <p className="mt-12 text-sm text-muted-foreground leading-relaxed max-w-xl italic">
              Built for catalog-heavy studios — every import lands in a staging
              table, never directly in production inventory. You commit or
              rollback per batch. Available on Pro and Studio plans.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Step({
  number,
  title,
  body,
}: {
  number: string
  title: string
  body: string
}) {
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-6">
      <span className="font-mono text-xs tracking-[0.1em] text-muted-foreground pt-1.5">
        {number}
      </span>
      <div>
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {body}
        </p>
      </div>
    </li>
  )
}

function SmartImportConsole() {
  // Per Claude Design rationale: muted sage `#9fd6a6`, not neon green.
  const FG = "#cdd6e4"
  const MUTED = "#7c879b"
  const ACCENT = "#9fd6a6"
  const PROMPT = "#5b6577"

  return (
    <div
      className="rounded-md overflow-hidden border border-border/40"
      style={{ backgroundColor: "#11151c" }}
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b"
        style={{ borderColor: "#1d2330" }}
      >
        <div className="flex gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#3a3f48" }}
          />
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#3a3f48" }}
          />
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#3a3f48" }}
          />
        </div>
        <span
          className="font-mono text-[11px] tracking-[0.1em]"
          style={{ color: MUTED }}
        >
          smart-import · staging
        </span>
        <span
          className="ml-auto font-mono text-[11px]"
          style={{ color: PROMPT }}
        >
          v0.1
        </span>
      </div>

      {/* Body */}
      <div
        className="p-5 sm:p-6 font-mono text-[13px] leading-[1.5] space-y-1"
        style={{ color: FG }}
      >
        <ConsoleLine prompt color={PROMPT}>
          smart-import scan supplier-site.com/lookbook
        </ConsoleLine>
        <ConsoleLine arrow color={MUTED}>
          Scanning supplier-site.com/lookbook ...
        </ConsoleLine>
        <ConsoleLine arrow color={MUTED}>
          Detected 3 categories:{" "}
          <span style={{ color: ACCENT }}>Necklaces</span>,{" "}
          <span style={{ color: ACCENT }}>Earrings</span>,{" "}
          <span style={{ color: ACCENT }}>Rings</span>
        </ConsoleLine>
        <ConsoleLine arrow color={MUTED}>
          Extracting <span style={{ color: ACCENT }}>47 items</span> in
          Necklaces ...
        </ConsoleLine>
        <ConsoleLine arrow color={MUTED}>
          Item 12/47 — variants:{" "}
          <span style={{ color: ACCENT }}>4</span> / weight:{" "}
          <span style={{ color: ACCENT }}>12.4g</span> / price:{" "}
          <span style={{ color: ACCENT }}>$890</span>
        </ConsoleLine>
        <ConsoleLine arrow color={MUTED}>
          Staging batch ready.{" "}
          <span style={{ color: ACCENT }}>47 items</span> pending review.
        </ConsoleLine>
        <div className="flex items-center gap-2 pt-2">
          <span style={{ color: PROMPT }}>›</span>
          <span
            aria-hidden
            className="inline-block h-[1em] w-[0.55em]"
            style={{ backgroundColor: PROMPT }}
          />
        </div>
      </div>
    </div>
  )
}

function ConsoleLine({
  prompt,
  arrow,
  color,
  children,
}: {
  prompt?: boolean
  arrow?: boolean
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2.5">
      <span style={{ color }} aria-hidden>
        {prompt ? "$" : arrow ? "›" : " "}
      </span>
      <span>{children}</span>
    </div>
  )
}
