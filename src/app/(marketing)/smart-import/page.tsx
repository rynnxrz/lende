import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Smart Import — lende",
  description:
    "Catalog import tooling for lende. Currently in development.",
}

export default function SmartImportPage() {
  return (
    <main>
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● Import
          </p>
          <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-3xl">
            Coming soon — PDF Lookbook view in development.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            We&apos;re building a way to import inventory from supplier lookbooks and catalogs.
            Drop us a line if you&apos;d like early access.
          </p>
          <div className="mt-8">
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Get in touch
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
