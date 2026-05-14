'use client'

import { useState, useTransition, useEffect } from 'react'
import { Mail, Check, X } from 'lucide-react'
import { resendVerificationEmailAction } from '@/app/actions/auth/signup'

function readEmailVerifiedFlag(): boolean {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('email_verified') === '1'
}

/**
 * BRIEF-05 — Email verification banner (D8 async flow).
 *
 * Renders at the top of the admin layout when the current user's
 * `email_confirmed_at` is null. Stays out of the way visually but is
 * persistent — only goes away when:
 *   - the user clicks the verification link in their email, OR
 *   - the user clicks "Already verified, refresh".
 *
 * The banner does NOT lock functionality. Per BRIEF-05 step 5 the
 * partial lock is by trial day count; that gate lives elsewhere
 * (BRIEF-04 / billing) and reads `email_confirmed_at` + `trial_ends_at`.
 *
 * Props:
 *   - email: the user's email (so we can show "we sent it to ___").
 *
 * Server action: `resendVerificationEmailAction` (no args — reads
 * email from session).
 */

export interface EmailVerificationBannerProps {
    email: string
}

type BannerState =
    | { kind: 'idle' }
    | { kind: 'sent' }
    | { kind: 'error'; message: string }
    | { kind: 'verified' }

export function EmailVerificationBanner({ email }: EmailVerificationBannerProps) {
    const [isPending, startTransition] = useTransition()
    // Lazy initializer reads the URL once on first render — avoids a
    // setState-in-effect cascade. Server render returns false (no window).
    const [state, setState] = useState<BannerState>(() =>
        readEmailVerifiedFlag() ? { kind: 'verified' } : { kind: 'idle' }
    )
    const [dismissed, setDismissed] = useState(false)

    // If we landed here with ?email_verified=1, strip it from the URL so
    // a refresh doesn't keep re-asserting verified state. This effect
    // only touches the browser history (external system) — no setState.
    useEffect(() => {
        if (typeof window === 'undefined') return
        const params = new URLSearchParams(window.location.search)
        if (params.get('email_verified') !== '1') return
        params.delete('email_verified')
        const newSearch = params.toString()
        window.history.replaceState(
            null,
            '',
            window.location.pathname +
                (newSearch ? '?' + newSearch : '') +
                window.location.hash
        )
    }, [])

    if (dismissed || state.kind === 'verified') return null

    const handleResend = () => {
        startTransition(async () => {
            const result = await resendVerificationEmailAction()
            if (result.ok) {
                setState({ kind: 'sent' })
            } else {
                setState({ kind: 'error', message: result.error })
            }
        })
    }

    const handleAlreadyVerified = () => {
        // Force a refresh — middleware re-reads the user and the banner
        // won't render if email_confirmed_at is now set.
        if (typeof window !== 'undefined') {
            window.location.reload()
        }
    }

    return (
        <div
            role="status"
            aria-live="polite"
            data-testid="email-verification-banner"
            className="w-full bg-amber-50 border-b border-amber-200 text-amber-900"
        >
            <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
                <Mail className="h-4 w-4 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                    {state.kind === 'sent' ? (
                        <span>
                            <Check className="inline h-3.5 w-3.5 mr-1" />
                            Verification email sent to <strong>{email}</strong>. Check your
                            inbox (and spam folder).
                        </span>
                    ) : state.kind === 'error' ? (
                        <span className="text-red-700">
                            Couldn&apos;t resend the email: {state.message}
                        </span>
                    ) : (
                        <span>
                            Please verify your email <strong>{email}</strong> to secure your
                            account.
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={isPending}
                        className="text-xs font-medium px-3 py-1 rounded bg-amber-100 hover:bg-amber-200 disabled:opacity-50"
                    >
                        {isPending ? 'Sending…' : 'Resend email'}
                    </button>
                    <button
                        type="button"
                        onClick={handleAlreadyVerified}
                        className="text-xs font-medium px-3 py-1 rounded text-amber-900 hover:bg-amber-100"
                    >
                        Already verified
                    </button>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        aria-label="Dismiss"
                        className="p-1 rounded hover:bg-amber-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
