import type { Metadata } from "next"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

/**
 * (marketing) route group layout.
 *
 * Independent from src/app/layout.tsx's tenant Header — Header.tsx detects
 * pathname and skips on marketing routes (see Header.tsx MARKETING_PATHS).
 *
 * This layout owns the marketing-only sticky header (logo, nav, primary CTA,
 * dark mode toggle) and footer.
 *
 * Brand = lende (D1 locked 2026-05-02, BRIEF-07 string scrub completed).
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://lende.shipbyx.com"),
  title: {
    default: "lende — Run rental, wholesale, and retail from one back-office",
    template: "%s — lende",
  },
  description:
    "Operating system for jewelry and accessory studios. Built for studios that don't fit a Shopify template. Invitation-only early access.",
  openGraph: {
    title: "lende — Operating system for studios",
    description:
      "Run rental, wholesale, and retail from one back-office. Built for studios that don't fit a Shopify template.",
    type: "website",
    url: "https://lende.shipbyx.com",
    siteName: "lende",
    images: [
      {
        url: "/marketing/og-image.png",
        width: 1200,
        height: 630,
        alt: "lende — Operating system for studios",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "lende — Operating system for studios",
    description:
      "Run rental, wholesale, and retail from one back-office. Built for studios that don't fit a Shopify template.",
    images: ["/marketing/og-image.png"],
  },
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-background text-foreground">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  )
}
