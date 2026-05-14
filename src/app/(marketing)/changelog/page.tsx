import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Changelog — lende",
  description: "What's new in lende. Release notes, bug fixes, and improvements.",
}

type Tag = "NEW" | "FIX" | "PERF"

const tagStyles: Record<Tag, string> = {
  NEW: "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
  FIX: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PERF: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
}

const entries: { date: string; tag: Tag; title: string; body: string }[] = [
  {
    date: "2026-05-04",
    tag: "NEW",
    title: "Invitation-based onboarding",
    body: "Studios now onboard via invitation email. System admin creates an org, sends an invite, and the studio owner registers through a secure token link.",
  },
  {
    date: "2026-05-04",
    tag: "NEW",
    title: "Multi-tenant organization schema",
    body: "Core database schema now supports multiple organizations. Each studio gets its own isolated workspace with organization-scoped data.",
  },
  {
    date: "2026-05-04",
    tag: "NEW",
    title: "Marketing site launch",
    body: "Full 14-page marketing site: pricing, features, demo, catalog import, about, case study, contact, docs, changelog, roadmap, and legal pages.",
  },
  {
    date: "2026-05-03",
    tag: "NEW",
    title: "Product naming: lende",
    body: "Locked product name to 'lende'. All user-facing strings, domains, and branding updated. Domain: lende.shipbyx.com.",
  },
  {
    date: "2026-05-01",
    tag: "NEW",
    title: "Path-based multi-tenant routing",
    body: "URL structure now supports /{org}/admin/... pattern. Legacy root URLs redirect to /ivyjstudio/... for backward compatibility.",
  },
]

export default function ChangelogPage() {
  return (
    <main>
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● Changelog
          </p>
          <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-3xl">
            What&apos;s new in lende.
          </h1>
        </div>
      </section>

      {/* Entries */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <div className="max-w-2xl space-y-0">
            {entries.map((entry, i) => (
              <div
                key={`${entry.date}-${entry.title}`}
                className={`py-8 ${i > 0 ? "border-t border-border/50" : ""}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <time className="text-xs font-mono text-muted-foreground">
                    {entry.date}
                  </time>
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium tracking-[0.05em] ${tagStyles[entry.tag]}`}
                  >
                    {entry.tag}
                  </span>
                </div>
                <h2 className="text-sm font-medium text-foreground mb-2">
                  {entry.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {entry.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
