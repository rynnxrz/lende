"use client"

export const dynamic = "force-dynamic"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import {
  requestLoginOtpAction,
  verifyLoginOtpAction,
} from "@/app/actions/auth/login-otp"
import { toast } from "sonner"

type Stage = "email" | "code" | "password"

const RESEND_COOLDOWN_S = 30

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

  // ?email=<email> prefill (set by signup redirect when slug overlap)
  const emailHint = searchParams?.get("email")?.trim() ?? ""
  const [email, setEmail] = useState(emailHint)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")

  const [stage, setStage] = useState<Stage>("email")
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

  // Resend cooldown for OTP stage.
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_S)
  const [resending, setResending] = useState(false)
  useEffect(() => {
    if (stage !== "code") return
    setResendIn(RESEND_COOLDOWN_S)
    const i = window.setInterval(() => {
      setResendIn((s) => (s <= 0 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(i)
  }, [stage])

  // ---------------------------------------------------------------------
  // Post-auth multi-org redirect (shared by OTP and password paths).
  // ---------------------------------------------------------------------
  const redirectAfterAuth = async (userId: string) => {
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
      router.refresh()
      router.push(nextHint ?? "/admin")
      return
    }

    if (count === 1) {
      router.refresh()
      router.push(nextHint ?? `/${slugs[0]}/admin`)
      return
    }

    // ≥ 2 orgs → workspace picker.
    router.refresh()
    const target = nextHint
      ? `/select-workspace?next=${encodeURIComponent(nextHint)}`
      : "/select-workspace"
    router.push(target)
  }

  // ---------------------------------------------------------------------
  // OTP — request code
  // ---------------------------------------------------------------------
  const onRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setErrorField(null)

    const res = await requestLoginOtpAction({ email: email.trim() })

    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      setErrorField(res.field ?? null)
      return
    }
    setStage("code")
  }

  // ---------------------------------------------------------------------
  // OTP — verify code
  // ---------------------------------------------------------------------
  const onVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setErrorField(null)

    const res = await verifyLoginOtpAction({
      email: email.trim(),
      code: code.trim(),
    })

    if (!res.ok) {
      setLoading(false)
      setError(res.error)
      setErrorField(res.field ?? null)
      return
    }

    await redirectAfterAuth(res.userId)
  }

  const onResendCode = async () => {
    if (resendIn > 0 || resending) return
    setResending(true)
    setError(null)
    const res = await requestLoginOtpAction({ email: email.trim() })
    if (!res.ok) {
      setResending(false)
      setError(res.error)
      return
    }
    setResending(false)
    setResendIn(RESEND_COOLDOWN_S)
    toast.success("Verification code sent")
  }

  // ---------------------------------------------------------------------
  // Password fallback
  // ---------------------------------------------------------------------
  const onPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setErrorField(null)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
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

    await redirectAfterAuth(userId)
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
              {stage === "code"
                ? "Enter the 6-digit code we just emailed you."
                : stage === "password"
                  ? "Sign in with your password."
                  : "Sign in to access your studio dashboard."}
            </p>

            {resetBanner && (
              <div
                role="status"
                className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              >
                Password updated. Sign in with your new password to continue.
              </div>
            )}

            {stage === "email" && (
              <form onSubmit={onRequestCode} className="space-y-4">
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
                    autoFocus
                    className="w-full rounded-md border border-border bg-background h-11 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="you@studio.com"
                  />
                  {errorField === "email" && error && (
                    <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  )}
                </div>

                {error && !errorField && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {loading ? "Sending code..." : "Email me a 6-digit code"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("password")
                      setError(null)
                      setErrorField(null)
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                  >
                    Sign in with password instead
                  </button>
                </div>
              </form>
            )}

            {stage === "code" && (
              <form onSubmit={onVerifyCode} className="space-y-4">
                <p className="text-sm text-muted-foreground text-center -mt-4 mb-2">
                  We sent a code to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                </p>

                <div>
                  <label
                    htmlFor="code"
                    className="block text-xs font-medium text-foreground mb-1.5"
                  >
                    6-digit code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    required
                    autoFocus
                    className="w-full rounded-md border border-border bg-background h-12 px-3 text-center text-lg tracking-[0.4em] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    placeholder="123456"
                  />
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  {loading ? "Verifying..." : "Verify and sign in"}
                </button>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("email")
                      setCode("")
                      setError(null)
                    }}
                    className="hover:text-foreground hover:underline underline-offset-4"
                  >
                    ← Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={onResendCode}
                    disabled={resendIn > 0 || resending}
                    className="hover:text-foreground hover:underline underline-offset-4 disabled:opacity-60 disabled:no-underline"
                  >
                    {resending
                      ? "Sending..."
                      : resendIn > 0
                        ? `Resend in ${resendIn}s`
                        : "Resend code"}
                  </button>
                </div>
              </form>
            )}

            {stage === "password" && (
              <form onSubmit={onPasswordLogin} className="space-y-4">
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
                    autoFocus
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

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => {
                      setStage("email")
                      setPassword("")
                      setError(null)
                    }}
                    className="hover:text-foreground hover:underline underline-offset-4"
                  >
                    ← Email me a code instead
                  </button>
                  <Link
                    href="/forgot-password"
                    className="hover:text-foreground hover:underline underline-offset-4"
                  >
                    Forgot password?
                  </Link>
                </div>
              </form>
            )}

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
