"use client"

export const dynamic = "force-dynamic"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { invalidateResetSessionsAction } from "@/app/actions/auth/reset-password"

/**
 * BRIEF-59 — /reset-password page.
 *
 * Reached via `/auth/callback?type=recovery&next=/reset-password`. The
 * callback runs `verifyOtp({ type: 'recovery' })` which signs the user
 * in with a recovery-only session. We surface a "set new password" form
 * + confirmation, and delegate the actual update to resetPasswordAction.
 *
 * Visual layout mirrors /login (lende design system).
 */
export default function ResetPasswordPage() {
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])
    const [password, setPassword] = useState("")
    const [confirm, setConfirm] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [sessionReady, setSessionReady] = useState<boolean | null>(null)

    // Confirm there is a recovery session before letting the user
    // submit. If the link expired (or the user navigated here directly)
    // we redirect to /forgot-password.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser()
            if (cancelled) return
            setSessionReady(!!user)
        })()
        return () => {
            cancelled = true
        }
    }, [supabase])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (password.length < 8) {
            setError("Password must be at least 8 characters.")
            return
        }
        if (password !== confirm) {
            setError("Passwords don't match.")
            return
        }

        setLoading(true)

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
            setLoading(false)
            setSessionReady(false)
            setError("Your reset link has expired. Please request a new one.")
            return
        }

        const {
            data: { session },
        } = await supabase.auth.getSession()

        const { error: updateError } = await supabase.auth.updateUser({
            password,
        })

        if (updateError) {
            setLoading(false)
            setError(updateError.message)
            return
        }

        if (session?.access_token) {
            const result = await invalidateResetSessionsAction(session.access_token)
            if (!result.ok) {
                setLoading(false)
                setError(result.error)
                return
            }
        }

        await supabase.auth.signOut({ scope: "local" })
        setLoading(false)

        // The global invalidation action clears old sessions. We also
        // clear this browser's local auth state before returning to login.
        router.replace("/login?password_reset=1")
        router.refresh()
    }

    if (sessionReady === false) {
        return (
            <main>
                <section>
                    <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                        <div className="max-w-sm mx-auto text-center space-y-4">
                            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-4">
                                ● Reset password
                            </p>
                            <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground mb-2">
                                Link expired.
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                This reset link is no longer valid. Request a new one to
                                continue.
                            </p>
                            <div className="pt-4">
                                <Link
                                    href="/forgot-password"
                                    className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                                >
                                    Request a new reset link
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        )
    }

    return (
        <main>
            <section>
                <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-24 pb-20 md:pt-32 md:pb-28">
                    <div className="max-w-sm mx-auto">
                        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase mb-8 text-center">
                            ● Reset password
                        </p>
                        <h1 className="text-3xl font-light tracking-[0.02em] leading-[1.1] text-foreground text-center mb-2">
                            Set a new password.
                        </h1>
                        <p className="text-sm text-muted-foreground text-center mb-10">
                            Choose a password you haven&apos;t used here before.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label
                                    htmlFor="password"
                                    className="block text-xs font-medium text-foreground mb-1.5"
                                >
                                    New password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoFocus
                                    className="w-full rounded-md border border-border bg-background h-11 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                    placeholder="At least 8 characters"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="confirm"
                                    className="block text-xs font-medium text-foreground mb-1.5"
                                >
                                    Confirm new password
                                </label>
                                <input
                                    id="confirm"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    className="w-full rounded-md border border-border bg-background h-11 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                />
                            </div>

                            {error && (
                                <div
                                    role="alert"
                                    className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                                >
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || sessionReady === false}
                                className="w-full inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                            >
                                {loading ? "Updating..." : "Update password"}
                            </button>
                        </form>

                        <p className="mt-8 text-xs text-muted-foreground text-center">
                            After updating, you&apos;ll be signed out everywhere and need to
                            sign in again with the new password.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    )
}
