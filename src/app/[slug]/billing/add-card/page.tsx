import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

/**
 * BRIEF-60 — day-14 paywall landing page (D37 hard freeze).
 *
 * Stub page rendered when middleware redirects an expired-trial mutating
 * request (or when a user clicks "Add a card" from the trial banner).
 *
 * Lemon Squeezy integration is intentionally NOT wired here — that's a
 * follow-up brief (D2 locked LS, but the embed code + checkout link
 * generation lives elsewhere). For now the page offers two paths:
 *
 *   1. Contact founder@shipbyx.com to upgrade or request a one-time
 *      7-day extension (mailto: subject + body prefilled with org slug).
 *   2. Continue with read-only access — the user can still view their
 *      existing reservations / items, just can't create / edit / delete
 *      until they add a card.
 *
 * The page is *server-rendered* so we can read the org's
 * `trial_ends_at` and `subscription_status` and tailor copy accordingly
 * (e.g. "your trial ended 3 days ago" vs "your trial ends tomorrow").
 *
 * If subscription_status is anything other than NULL / 'trialing' (i.e.
 * the user paid in the meantime), we redirect back to /<slug>/admin so
 * paying users are never stuck on this page.
 */

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ reason?: string }>
}

export default async function BillingAddCardPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const { reason } = await searchParams

  // Auth check — middleware already redirects unauth'd users, but
  // double-check here so we don't render to a stranger.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?next=/${slug}/billing/add-card`)
  }

  const service = createServiceClient()
  const { data: org } = await service
    .from("organizations")
    .select("name, plan, trial_ends_at, subscription_status")
    .eq("slug", slug)
    .maybeSingle()

  const subscriptionStatus = (org?.subscription_status ?? "").toLowerCase()
  if (subscriptionStatus && subscriptionStatus !== "trialing") {
    // Already paid — bounce back to admin.
    redirect(`/${slug}/admin`)
  }

  const trialEnd = org?.trial_ends_at ? new Date(org.trial_ends_at) : null
  const now = new Date()
  const daysDiff = trialEnd
    ? Math.round((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null

  const heading =
    daysDiff != null && daysDiff < 0
      ? `Your trial ended ${Math.abs(daysDiff)} day${Math.abs(daysDiff) === 1 ? "" : "s"} ago.`
      : "Add a card to keep going."

  const subhead =
    reason === "trial_ended"
      ? "We saved your data — adding a card unlocks editing again."
      : "14 days flew by. Your data is safe. Add a card to continue making changes."

  const orgName = org?.name ?? slug
  const mailtoExtend = buildMailto(
    "founder@shipbyx.com",
    `Trial extension request — ${orgName}`,
    `Hi,\n\nCould we extend the lende trial for ${orgName} (${slug}) by 7 days while we evaluate?\n\nThanks,`,
  )
  const mailtoContact = buildMailto(
    "founder@shipbyx.com",
    `lende paid plan — ${orgName}`,
    `Hi,\n\nWe're ready to move ${orgName} (${slug}) to a paid plan. What are the next steps?\n\nThanks,`,
  )

  return (
    <main>
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-md mx-auto">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8 text-center">
              ● Trial · {orgName}
            </p>
            <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground text-center mb-3">
              {heading}
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-10">
              {subhead}
            </p>

            <div className="space-y-3">
              <a
                href={mailtoContact}
                className="block w-full rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Contact founder to upgrade
              </a>
              <a
                href={mailtoExtend}
                className="block w-full rounded-md border border-border bg-background px-4 py-3 text-center text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Request 7-day extension
              </a>
              <Link
                href={`/${slug}/admin`}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4 py-2"
              >
                Continue in read-only mode →
              </Link>
            </div>

            <div className="mt-10 pt-6 border-t border-border">
              <h2 className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-4">
                What stays
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• All items, reservations, and customer records</li>
                <li>• Existing reservations continue running</li>
                <li>• Read-only dashboard access</li>
                <li>• Data preserved 90 days from trial end</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function buildMailto(to: string, subject: string, body: string) {
  const params = new URLSearchParams({ subject, body })
  return `mailto:${to}?${params.toString()}`
}
