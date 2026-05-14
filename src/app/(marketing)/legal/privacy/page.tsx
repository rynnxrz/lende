import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy — lende",
  description: "How lende collects, uses, and protects your data.",
}

export default function PrivacyPage() {
  return (
    <main>
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
          <h1 className="text-3xl sm:text-4xl font-light tracking-[0.02em] leading-[1.1] text-foreground mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            This page is coming soon. For current legal language or compliance questions, contact{" "}
            <a href="mailto:founder@shipbyx.com" className="underline hover:text-foreground transition-colors">
              founder@shipbyx.com
            </a>.
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            We&apos;ll publish reviewed-by-counsel versions once the lende customer base reaches the threshold to justify formal legal review.
          </p>
        </div>
      </section>
    </main>
  )
}
