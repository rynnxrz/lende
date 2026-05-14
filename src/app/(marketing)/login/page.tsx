"use client"

export const dynamic = "force-dynamic"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // BRIEF-59 — show a one-time success banner when redirected here from
  // /reset-password after a successful password change.
  const passwordResetSuccess = searchParams?.get("password_reset") === "1"
  const [resetBanner, setResetBanner] = useState<boolean>(passwordResetSuccess)
  useEffect(() => {
    setResetBanner(searchParams?.get("password_reset") === "1")
  }, [searchParams])

  // BRIEF-60 — `?org=<slug>` direct-land hint.
  const orgHint = searchParams?.get("org")?.trim().toLowerCase() ?? null
  // BRIEF-60 — `?next=<path>` lets pages (e.g. billing) bounce here for
  // re-authentication and bring the user back.
  const nextHint = searchParams?.get("next")?.trim() ?? null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const userId = data.user?.id
    if (!userId) {
      setError("Sign-in succeeded but no user was returned. Please retry.")
      setLoading(false)
      return
    }

    // ----------------------------------------------------------------
    // BRIEF-60 — multi-org redirect logic.
    // ----------------------------------------------------------------
    // Count the user's active org memberships. We use anon-key client
    // (the user's now-authenticated session) — RLS returns only the
    // user's own rows.
    const { data: memberships, error: memberError } = await supabase
      .from("organization_members")
      .select("organization_id, organizations!inner(slug)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    type Row = { organization_id: string; organizations: { slug: string } }
    const rows = (memberships ?? []) as unknown as Row[]
    const slugs = rows
      .map((r) => r.organizations?.slug)
      .filter((s): s is string => typeof s === "string" && s.length > 0)

    const count = slugs.length

    // Honour `?org=<slug>` → skip picker if the user is in that org.
    if (orgHint && slugs.includes(orgHint)) {
      router.refresh()
      router.push(nextHint ?? `/${orgHint}/admin`)
      return
    }

    if (count === 0) {
      // No org memberships — let the legacy /admin route do its thing
      // (it will redirect to the default org or onboarding).
      router.refresh()
      router.push(nextHint ?? "/admin")
      return
    }

    if (count === 1) {
      router.refresh()
      router.push(nextHint ?? `/${slugs[0]}/admin`)
      return
    }

    // ≥ 2 orgs → show picker.
    router.refresh()
    const target = nextHint
      ? `/select-workspace?next=${encodeURIComponent(nextHint)}`
      : "/select-workspace"
    router.push(target)
  }

  return (
    <main>
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-sm mx-auto">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8 text-center">
              ● Login
            </p>
            <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground text-center mb-2">
              Welcome back.
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-10">
              Sign in to access your studio dashboard.
            </p>

            {resetBanner && (
              <div
                role="status"
                className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              >
                Password updated. Sign in with your new password to continue.
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-foreground mb-1.5"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background h-11 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder="you@studio.com"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-foreground mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-background h-11 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>

              <div className="text-center">
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
            </form>

            <div className="mt-8 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link
                  href="/signup"
                  className="text-foreground hover:underline underline-offset-4 font-medium"
                >
                  Start free trial
                </Link>
              </p>
            </div>

            <div className="mt-8 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span>SOC 2 compliant infrastructure</span>
              <span className="h-3 w-px bg-border" />
              <span>256-bit encryption</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
