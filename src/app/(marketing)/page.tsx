import { Hero } from "@/components/marketing/Hero"
import { Problem } from "@/components/marketing/Problem"
import { ThreeWorkflows } from "@/components/marketing/ThreeWorkflows"
import { BuiltForJewelry } from "@/components/marketing/BuiltForJewelry"
import { Pricing } from "@/components/marketing/Pricing"
import { FinalCTA } from "@/components/marketing/FinalCTA"

// M-06: SoftwareApplication schema for the home page so search engines and
// LLM scrapers can identify lende as a SaaS product. Pricing is described in
// the linked /pricing schema (separate Offer entries).
const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "lende",
  description:
    "Operating system for jewelry and accessory studios. Run rental, wholesale, and retail from one back-office.",
  url: "https://lende.shipbyx.com",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: "19",
    highPrice: "129",
    offerCount: "3",
  },
  publisher: {
    "@type": "Organization",
    name: "ShipByX Ltd",
    url: "https://shipbyx.com",
  },
}

export default function LandingPage() {
  return (
    <main id="main-content" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
      <Hero />
      <Problem />
      <ThreeWorkflows />
      <BuiltForJewelry />
      <Pricing />
      <FinalCTA />
    </main>
  )
}
