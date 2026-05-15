"use client"

export const dynamic = "force-dynamic"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  requestSignupOtpAction,
  verifySignupOtpAction,
} from "@/app/actions/auth/signup-otp"
import { signupAction } from "@/app/actions/auth/signup"
import { track } from "@/lib/analytics/track"
import { toast } from "sonner"

type Stage = "form" | "code"

const RESEND_COOLDOWN_S = 30

export default function SignupPage() {
  return (
    <Suspense>
      <SignupContent />
    </Suspense>
  )
}

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isPasswordMode = searchParams?.get("mode") === "password"

  if (isPasswordMode) {
    return <PasswordSignupForm />
  }
  return <OtpSignupFlow router={router} />
}

// ---------------------------------------------------------------------------
// OTP path (default)
// ---------------------------------------------------------------------------

interface OtpFlowProps {
  router: ReturnType<typeof useRouter>
}

function OtpSignupFlow({ router }: OtpFlowProps) {
  const [stage, setStage] = useState<Stage>("form")
  const [email, setEmail] = useState("")
  const [storeName, setStoreName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [showSlugEditor, setShowSlugEditor] = useState(false)
  const [country, setCountry] = useState("")

  const [code, setCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorField, setErrorField] = useState<string | null>(null)
  const [loginRedirect, setLoginRedirect] = useState<{
    slug: string
    email: string
  } | null>(null)

  // Countdown for "Resend code" — starts when entering Stage B.
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

  // Auto-generate slug from store name unless the user has manually edited it.
  // Industry pattern (Linear / Vercel / Shopify): trial users shouldn't have
  // to think about URL slugs — auto-suggest, allow customize later.
  useEffect(() => {
    if (slugManuallyEdited) return
    setSlug(slugify(storeName))
  }, [storeName, slugManuallyEdited])

  const slugLooksValid = useMemo(
    () => /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug.trim().toLowerCase()),
    [slug],
  )

  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrorField(null)
    setLoginRedirect(null)

    const res = await requestSignupOtpAction({
      email: email.trim(),
      storeName: storeName.trim(),
      slug: slug.trim().toLowerCase(),
      country: country.trim() || undefined,
    })

    setSubmitting(false)
    if (!res.ok) {
      // BRIEF — email+slug overlap: show "Sign in to <slug>" CTA in
      // place of the inline error.
      if (res.action === "redirect_to_login" && res.slug) {
        setLoginRedirect({ slug: res.slug, email: email.trim() })
        return
      }
      setError(res.error)
      setErrorField(res.field ?? null)
      return
    }

    track("signup_otp_sent", { email_domain: emailDomain(email) })
    setStage("code")
  }

  const onSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setErrorField(null)

    const res = await verifySignupOtpAction({
      email: email.trim(),
      code: code.trim(),
    })

    if (!res.ok) {
      setSubmitting(false)
      setError(res.error)
      setErrorField(res.field ?? null)
      return
    }

    track("signup_otp_verified", { email_domain: emailDomain(email) })
    track("signup_org_provisioned", { slug: res.slug })

    // Hard navigate (router.refresh + router.push) so the SSR client
    // sees the freshly-set cookies on next request.
    router.refresh()
    router.push(`/${res.slug}/admin?onboarding=1`)
  }

  const onResend = async () => {
    if (resendIn > 0 || resending) return
    setResending(true)
    setError(null)
    const res = await requestSignupOtpAction({
      email: email.trim(),
      storeName: storeName.trim(),
      slug: slug.trim().toLowerCase(),
      country: country.trim() || undefined,
    })
    if (!res.ok) {
      setResending(false)
      setError(res.error)
      return
    }
    track("signup_otp_sent", { email_domain: emailDomain(email), resend: true })
    setResending(false)
    setResendIn(RESEND_COOLDOWN_S)
    toast.success("Verification code sent")
  }

  return (
    <main>
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-sm mx-auto">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8 text-center">
              ● Get started
            </p>

            {stage === "form" ? (
              <>
                <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground text-center mb-2">
                  Start your free trial.
                </h1>
                <p className="text-sm text-muted-foreground text-center mb-10">
                  14 days free, no credit card. We&apos;ll email you a 6-digit
                  code to get started.
                </p>

                <form onSubmit={onSubmitForm} className="space-y-4">
                  <FormField
                    id="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@gmail.com"
                    error={errorField === "email" ? error : null}
                    autoFocus
                  />
                  <FormField
                    id="storeName"
                    label="Brand name"
                    value={storeName}
                    onChange={setStoreName}
                    placeholder="Aurora Atelier"
                    error={errorField === "storeName" ? error : null}
                  />
                  <WorkspaceUrlField
                    slug={slug}
                    onChange={(next) => {
                      setSlug(next)
                      setSlugManuallyEdited(true)
                    }}
                    showEditor={showSlugEditor}
                    onToggleEditor={() => setShowSlugEditor((v) => !v)}
                    error={errorField === "slug" ? error : null}
                    showFormatHint={!error && !!slug && !slugLooksValid}
                  />
                  <FormField
                    id="country"
                    label="Country / region (optional)"
                    value={country}
                    onChange={setCountry}
                    placeholder="New Zealand"
                  />

                  {error && !errorField && (
                    <ErrorBanner message={error} />
                  )}

                  {loginRedirect && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <p className="mb-2">
                        You already own{" "}
                        <span className="font-medium">
                          &quot;{loginRedirect.slug}&quot;
                        </span>
                        . Sign in instead.
                      </p>
                      <Link
                        href={`/login?email=${encodeURIComponent(loginRedirect.email)}&org=${encodeURIComponent(loginRedirect.slug)}`}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90 transition-opacity"
                      >
                        Sign in to &quot;{loginRedirect.slug}&quot;
                      </Link>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {submitting ? "Sending code..." : "Email me a 6-digit code"}
                  </button>
                </form>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                  By continuing you agree to our{" "}
                  <Link href="/terms" className="underline underline-offset-4">
                    Terms
                  </Link>{" "}
                  &{" "}
                  <Link href="/privacy" className="underline underline-offset-4">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground text-center mb-2">
                  Check your email.
                </h1>
                <p className="text-sm text-muted-foreground text-center mb-10">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  It expires in 5 minutes.
                </p>

                <form onSubmit={onSubmitCode} className="space-y-4">
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

                  {error && <ErrorBanner message={error} />}

                  <button
                    type="submit"
                    disabled={submitting || code.length !== 6}
                    className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    {submitting ? "Verifying..." : "Verify and continue"}
                  </button>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => {
                        setStage("form")
                        setCode("")
                        setError(null)
                      }}
                      className="hover:text-foreground hover:underline underline-offset-4"
                    >
                      ← Use a different email
                    </button>
                    <button
                      type="button"
                      onClick={onResend}
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
              </>
            )}

            <div className="mt-8 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-foreground hover:underline underline-offset-4 font-medium"
                >
                  Log in
                </Link>
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Prefer a password?{" "}
                <Link
                  href="/signup?mode=password"
                  className="hover:text-foreground hover:underline underline-offset-4"
                >
                  Use password instead
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Password fallback (?mode=password)
// ---------------------------------------------------------------------------

function PasswordSignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [storeName, setStoreName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false)
  const [showSlugEditor, setShowSlugEditor] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-generate slug from store name unless the user manually edited it.
  useEffect(() => {
    if (slugManuallyEdited) return
    setSlug(slugify(storeName))
  }, [storeName, slugManuallyEdited])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await signupAction({
      email: email.trim(),
      password,
      storeName: storeName.trim(),
      slug: slug.trim().toLowerCase(),
    })

    if (!res.ok) {
      setSubmitting(false)
      setError(res.error)
      return
    }

    track("signup_org_provisioned", { slug: res.slug, mode: "password" })
    router.refresh()
    router.push(`/${res.slug}/admin?onboarding=1`)
  }

  return (
    <main>
      <section>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-sm mx-auto">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8 text-center">
              ● Get started · password mode
            </p>
            <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground text-center mb-2">
              Create your account.
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-10">
              We&apos;ll email a verification link. 14-day trial, no credit card.
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@gmail.com"
                autoFocus
              />
              <FormField
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="At least 8 characters"
              />
              <FormField
                id="storeName"
                label="Brand name"
                value={storeName}
                onChange={setStoreName}
                placeholder="Aurora Atelier"
              />
              <WorkspaceUrlField
                slug={slug}
                onChange={(next) => {
                  setSlug(next)
                  setSlugManuallyEdited(true)
                }}
                showEditor={showSlugEditor}
                onToggleEditor={() => setShowSlugEditor((v) => !v)}
                error={null}
                showFormatHint={false}
              />

              {error && <ErrorBanner message={error} />}

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                {submitting ? "Creating workspace..." : "Create account"}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border text-center">
              <p className="text-sm text-muted-foreground">
                Prefer a code?{" "}
                <Link
                  href="/signup"
                  className="text-foreground hover:underline underline-offset-4 font-medium"
                >
                  Use 6-digit code instead
                </Link>
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-foreground hover:underline underline-offset-4 font-medium"
                >
                  Log in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface FormFieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  error?: string | null
  autoFocus?: boolean
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  autoFocus,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-foreground mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={!label.toLowerCase().includes("optional")}
        autoFocus={autoFocus}
        className="w-full rounded-md border border-border bg-background h-11 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        placeholder={placeholder}
      />
      {error && (
        <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">{error}</p>
      )}
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {message}
    </div>
  )
}

function emailDomain(email: string): string {
  const i = email.indexOf("@")
  return i >= 0 ? email.slice(i + 1).toLowerCase() : ""
}

/**
 * Convert a free-text studio name into a URL-safe slug.
 * "Aurora Atelier" → "aurora-atelier"
 * "Iv y!! Studio" → "iv-y-studio"
 * Caps at 32 chars to match validateSignupShape().
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "")
}

interface WorkspaceUrlFieldProps {
  slug: string
  onChange: (next: string) => void
  showEditor: boolean
  onToggleEditor: () => void
  error: string | null
  showFormatHint: boolean
}

/**
 * Workspace URL field — collapsed by default, shows live preview only.
 *
 * Industry pattern (Linear, Vercel, Shopify): trial signup auto-generates
 * the slug from the workspace name. Power users can click "Customize" to
 * edit. This removes one input from the default flow without losing the
 * ability to override.
 */
function WorkspaceUrlField({
  slug,
  onChange,
  showEditor,
  onToggleEditor,
  error,
  showFormatHint,
}: WorkspaceUrlFieldProps) {
  const hasSlug = slug.length > 0
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label
          htmlFor="slug"
          className="block text-xs font-medium text-foreground"
        >
          Workspace URL
        </label>
        {hasSlug && (
          <button
            type="button"
            onClick={onToggleEditor}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
          >
            {showEditor ? "Use suggested" : "Customize"}
          </button>
        )}
      </div>
      {showEditor ? (
        <div className="flex h-11 items-stretch rounded-md border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <span className="inline-flex items-center pl-3 pr-1 text-xs text-muted-foreground select-none">
            lende.shipbyx.com/
          </span>
          <input
            id="slug"
            type="text"
            value={slug}
            onChange={(e) =>
              onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            required
            autoFocus
            className="flex-1 bg-transparent px-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      ) : (
        <div className="flex h-11 items-center rounded-md border border-dashed border-border bg-muted/30 px-3 text-sm text-muted-foreground">
          <span className="select-none">lende.shipbyx.com/</span>
          {hasSlug ? (
            <span className="text-foreground font-medium truncate">{slug}</span>
          ) : (
            <span className="italic text-muted-foreground/70">
              fills in once you enter a brand name
            </span>
          )}
        </div>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-700 dark:text-red-300">{error}</p>
      )}
      {!error && showFormatHint && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Lowercase letters, numbers, dashes — 3 to 32 characters.
        </p>
      )}
      {!error && !showFormatHint && !showEditor && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Auto-generated from your brand name. You can change this anytime in
          settings.
        </p>
      )}
    </div>
  )
}
