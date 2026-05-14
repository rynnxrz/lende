import Link from "next/link"

/**
 * Marketing footer — 4 columns + tagline + lende wordmark.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
        <div className="grid md:grid-cols-12 gap-10 md:gap-8">
          {/* Brand block */}
          <div className="md:col-span-4">
            <Link
              href="/"
              className="text-base font-medium tracking-[0.2em] text-foreground hover:opacity-70 transition-opacity"
            >
              lende
            </Link>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm">
              Operating system for studios that do rental, wholesale, and
              retail.
            </p>
          </div>

          {/* Columns */}
          <FooterColumn
            title="Product"
            links={[
              { label: "Features", href: "/features" },
              { label: "Pricing", href: "/pricing" },
              { label: "Smart Import", href: "/smart-import" },
              { label: "Demo", href: "/demo" },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { label: "About", href: "/about" },
              { label: "Founder note", href: "/about#founder" },
              { label: "Case study", href: "/case-study" },
              { label: "Contact", href: "/contact" },
            ]}
          />
          <FooterColumn
            title="Resources"
            links={[
              { label: "Documentation", href: "/docs" },
              { label: "Changelog", href: "/changelog" },
              { label: "Roadmap", href: "/roadmap" },
            ]}
          />
          <FooterColumn
            title="Legal"
            links={[
              { label: "Privacy", href: "/legal/privacy" },
              { label: "Terms", href: "/legal/terms" },
              { label: "DPA", href: "/legal/dpa" },
            ]}
          />
        </div>

        <div className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <p className="text-xs text-muted-foreground tracking-[0.05em]">
            © {new Date().getFullYear()} lende. Built independently.
          </p>
          <p className="text-xs text-muted-foreground tracking-[0.05em]">
            Auckland · NZ · lende.shipbyx.com
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div className="md:col-span-2">
      <h3 className="text-xs font-medium tracking-[0.2em] uppercase text-foreground">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
