import Link from "next/link"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

export default function NotFound() {
  return (
    <div className="bg-background text-foreground">
      <main>
        <section>
          <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28 text-center">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
              404
            </p>
            <h1 className="text-4xl sm:text-5xl font-light tracking-[0.02em] leading-[1.1] text-foreground">
              Page not found.
            </h1>
            <p className="mt-6 text-sm text-muted-foreground max-w-md mx-auto">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Back to home
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Contact us
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  )
}
