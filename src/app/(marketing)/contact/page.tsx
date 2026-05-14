import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact — lende",
  description: "Get in touch with the lende team. Email or book a call.",
}

export default function ContactPage() {
  return (
    <main>
      {/* Hero */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-16 md:pt-32 md:pb-20">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8">
            ● Contact
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-[0.02em] leading-[1.1] text-foreground max-w-3xl">
            Pick one.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            Two ways to reach us. Both go directly to the founder.
          </p>
        </div>
      </section>

      {/* Two channels */}
      <section className="bg-muted/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Email */}
            <div className="rounded-lg border border-border bg-background p-8">
              <h2 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-4">
                Email — for general questions
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Pricing questions, partnership inquiries, or anything else.
                Reply within one business day.
              </p>
              <a
                href="mailto:founder@shipbyx.com?subject=lende%20inquiry"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                founder@shipbyx.com
              </a>
            </div>

            {/* Calendar */}
            <div className="rounded-lg border border-border bg-background p-8">
              <h2 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-4">
                Book a call — for product walkthrough
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                30-minute video call with the founder. Good for product walkthrough,
                onboarding, or checking if lende fits your workflow.
              </p>
              <a
                href="mailto:founder@shipbyx.com?subject=lende%20call%20request"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium text-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Request a time
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Office hours */}
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16 md:py-20">
          <h2 className="text-2xl sm:text-3xl font-light text-foreground mb-8">
            Office hours
          </h2>
          <div className="space-y-2 text-sm text-muted-foreground max-w-md">
            <p>
              <span className="text-foreground font-medium">Timezone:</span> NZST (UTC+12) / CST (UTC+8)
            </p>
            <p>
              <span className="text-foreground font-medium">Response time:</span> Within 24 hours on weekdays
            </p>
            <p>
              <span className="text-foreground font-medium">Location:</span> Auckland, New Zealand
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
