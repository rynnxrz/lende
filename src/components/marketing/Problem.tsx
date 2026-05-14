import {
  AlertTriangle,
  FileSpreadsheet,
  MessageCircle,
  FileText,
  LayoutGrid,
  Truck,
  ClipboardList,
  Send,
} from "lucide-react"

/**
 * Problem section — Today vs With lende (4+4).
 * Anchor lines from BRIEF-13 founder-context-and-ivy-case.md §2.1/§2.2.
 */
export function Problem() {
  return (
    <section className="border-t border-border bg-muted/30">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-24 md:py-32">
        <div className="max-w-2xl mb-16 md:mb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            02 / The Problem
          </p>
          <h2 className="mt-6 text-3xl sm:text-4xl lg:text-5xl font-light tracking-[0.02em] leading-[1.15] text-foreground">
            Studios run three businesses on tools built for one.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-px bg-border rounded-md overflow-hidden border border-border">
          {/* Today */}
          <div className="bg-muted/50 p-8 md:p-10">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-foreground/80 mb-8">
              Today
            </p>
            <ul className="space-y-6">
              <ProblemRow icon={AlertTriangle}>
                Shopify + plugins for rental — patched, brittle, every update
                breaks something.
              </ProblemRow>
              <ProblemRow icon={FileSpreadsheet}>
                Excel sheets for wholesale orders, reconciled by hand each week.
              </ProblemRow>
              <ProblemRow icon={MessageCircle}>
                WhatsApp threads for client requests — search through six months
                of chat to find the SKU.
              </ProblemRow>
              <ProblemRow icon={FileText}>
                Manual PDFs for invoices and lookbooks — 4+ hours every week.
              </ProblemRow>
            </ul>
          </div>

          {/* With lende */}
          <div className="bg-background p-8 md:p-10">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground mb-8">
              With lende
            </p>
            <ul className="space-y-6">
              <ProblemRow icon={LayoutGrid} variant="solution">
                One back-office for rental, wholesale, and retail — shared SKU,
                inventory, customers.
              </ProblemRow>
              <ProblemRow icon={Truck} variant="solution">
                Native B2B order workflow — PO, invoice, shipping, no CSV bridge.
              </ProblemRow>
              <ProblemRow icon={ClipboardList} variant="solution">
                Built-in client request capture — catalog → request → fulfillment
                in one trail.
              </ProblemRow>
              <ProblemRow icon={Send} variant="solution">
                Automated PDFs and shareable lookbooks — instant, dated, branded.
              </ProblemRow>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProblemRow({
  icon: Icon,
  variant = "today",
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  variant?: "today" | "solution"
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-4 items-start">
      <span
        className={`mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          variant === "solution"
            ? "bg-foreground text-background"
            : "bg-background text-muted-foreground border border-border"
        }`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      </span>
      <span className="text-sm leading-relaxed text-foreground">{children}</span>
    </li>
  )
}
