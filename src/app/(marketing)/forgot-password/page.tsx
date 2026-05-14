"use client"

export const dynamic = "force-dynamic"

import { useState } from "react"
import Link from "next/link"
import { forgotPasswordAction } from "@/app/actions/auth/forgot-password"

/**
 * BRIEF-59 — /forgot-password page.
 *
 * Single-input form that calls forgotPasswordAction. The success
 * response is identical regardless of whether the email exists in
 * auth.users (anti-enumeration — see action header).
 *
 * Visual layout mirrors /login (lende design system):
 *  - mono uppercase eyebrow
 *  - light-weight 3xl heading
 *  - 11-tap-height inputs + buttons
 *  - small footer link back to /login
 */
export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        const result = await forgotPasswordAction({ email })

        setLoading(false)

        if (!result.ok) {
            setError(result.error)
            return
        }

        // Always show the same confirmation, regardless of whether the
        // address was found. Anti-enumeration.
        setSubmitted(true)
    }

    return (
        <main>
            <section>
                <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                    <div className="max-w-sm mx-auto">
                        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8 text-center">
                            ● Reset password
                        </p>

                        {submitted ? (
                            <div className="text-center space-y-4">
                                <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground mb-2">
                                    Check your inbox.
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    If an account exists for{" "}
                                    <span className="text-foreground font-medium">{email}</span>,
                                    we&apos;ve sent a reset link. The link will expire in about
                                    one hour.
                                </p>
                                <p className="text-sm text-muted-foreground pt-2">
                                    Didn&apos;t get the email? Check spam, or{" "}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSubmitted(false)
                                            setEmail("")
                                        }}
                                        className="text-foreground hover:underline underline-offset-4 font-medium"
                                    >
                                        try a different address
                                    </button>
                                    .
                                </p>
                                <div className="pt-6">
                                    <Link
                                        href="/login"
                                        className="text-sm text-foreground hover:underline underline-offset-4 font-medium"
                                    >
                                        Back to sign in
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground text-center mb-2">
                                    Forgot your password?
                                </h1>
                                <p className="text-sm text-muted-foreground text-center mb-10">
                                    Enter the email tied to your account and we&apos;ll send a
                                    reset link.
                                </p>

                                <form onSubmit={handleSubmit} className="space-y-4">
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
                                            autoComplete="email"
                                            autoFocus
                                            className="w-full rounded-md border border-border bg-background h-11 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                            placeholder="you@studio.com"
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
                                        {loading ? "Sending..." : "Send reset link"}
                                    </button>
                                </form>

                                <div className="mt-8 pt-6 border-t border-border text-center">
                                    <p className="text-sm text-muted-foreground">
                                        Remember it now?{" "}
                                        <Link
                                            href="/login"
                                            className="text-foreground hover:underline underline-offset-4 font-medium"
                                        >
                                            Back to sign in
                                        </Link>
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </section>
        </main>
    )
}
