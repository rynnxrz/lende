import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Documentation — lende",
  description: "Getting started guides, API reference, and help articles for lende.",
}

const categories = [
  { name: "Getting started", count: 2 },
  { name: "Rental", count: 1 },
  { name: "Wholesale", count: 1 },
  { name: "Catalog Import", count: 1 },
]

const articles = [
  {
    category: "Getting started",
    title: "Setting up your workspace",
    description: "Create your organization, invite team members, and configure your first catalog.",
    slug: "setup",
  },
  {
    category: "Getting started",
    title: "Importing your first items",
    description: "Add inventory manually or use catalog import to bulk-add from a supplier source.",
    slug: "first-import",
  },
  {
    category: "Rental",
    title: "Managing reservations",
    description: "Create, approve, and track rental reservations. Handle returns and damage reports.",
    slug: "reservations",
  },
  {
    category: "Wholesale",
    title: "Wholesale pricing and orders",
    description: "Set up tiered pricing for trade customers and manage bulk orders.",
    slug: "wholesale-orders",
  },
  {
    category: "Catalog Import",
    title: "Catalog import: sources and limits",
    description: "What sources catalog import accepts, how extraction works, and current plan limits.",
    slug: "smart-import-guide",
  },
]

export default function DocsPage() {
  return (
    <main>
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <div className="flex items-center gap-3 mb-8">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              ● Docs
            </p>
            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
              Early
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-3xl">
            Documentation
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            lende is early, and so are these docs. We&apos;re adding articles as studios
            ask questions. If something is missing, email founder@shipbyx.com.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <div className="grid lg:grid-cols-[200px_1fr] gap-12">
            {/* Category nav */}
            <nav className="lg:sticky lg:top-24 lg:self-start">
              <h2 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-4">
                Categories
              </h2>
              <ul className="space-y-2">
                {categories.map((cat) => (
                  <li key={cat.name}>
                    <span className="text-sm text-foreground">
                      {cat.name}
                      <span className="ml-2 text-xs text-muted-foreground">({cat.count})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Article tiles */}
            <div className="grid sm:grid-cols-2 gap-4">
              {articles.map((article) => (
                <div
                  key={article.slug}
                  className="rounded-lg border border-border bg-background p-6 hover:border-foreground/20 transition-colors"
                >
                  <p className="text-xs font-medium tracking-[0.15em] text-muted-foreground uppercase mb-2">
                    {article.category}
                  </p>
                  <h3 className="text-sm font-medium text-foreground mb-2">
                    {article.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {article.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Growing pill */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20 text-center">
          <span className="inline-block rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 mb-6 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
            Growing
          </span>
          <h2 className="text-2xl sm:text-3xl font-light text-foreground">
            More docs are coming.
          </h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
            Every new studio question becomes a doc article. If you need help with
            something not covered here, reach out.
          </p>
          <a
            href="mailto:founder@shipbyx.com?subject=lende%20docs%20question"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Ask a question
          </a>
        </div>
      </section>
    </main>
  )
}
