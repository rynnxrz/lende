'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * BRIEF-59 — Forgot password server action.
 *
 * Sends a password-reset email via Supabase Auth (`resetPasswordForEmail`).
 * Supabase routes the email through the configured SMTP provider (Resend,
 * per BRIEF-37) using the dashboard "Reset Password" template.
 *
 * Security properties (BRIEF-59 risk #2 mitigation):
 *   - **Always returns ok:true**, regardless of whether the email exists,
 *     to prevent email-enumeration. The caller renders the same "If an
 *     account exists for this email, we've sent a reset link." copy in
 *     every code path.
 *   - The `redirectTo` callback URL contains `type=recovery` so
 *     `auth/callback/route.ts` can route the verified session to
 *     `/reset-password` (instead of the default `/{slug}/admin`).
 *   - Token TTL is governed by the Supabase Auth settings (default 1
 *     hour). We rely on the default — do not override.
 *
 * Out of scope: OTP magic-link login (passwordless). Tracked as a
 * follow-up brief; this action is reset-only.
 */
export interface ForgotPasswordInput {
    email: string
}

export type ForgotPasswordResult = { ok: true } | { ok: false; error: string }

export async function forgotPasswordAction(
    input: ForgotPasswordInput,
): Promise<ForgotPasswordResult> {
    const email = (input.email ?? '').trim().toLowerCase()

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        // Even invalid email shapes return ok:true so the response is
        // indistinguishable from the "valid email, no account" case.
        // We only hard-fail when the input is *empty* (caller bug).
        if (!email) {
            return { ok: false, error: 'Email is required.' }
        }
        return { ok: true }
    }

    const supabase = await createClient()

    // Build redirectTo from request origin so dev / preview / prod each
    // route back to themselves.
    const hdrs = await headers()
    const proto = hdrs.get('x-forwarded-proto') ?? 'https'
    const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? 'lende.shipbyx.com'
    const origin = `${proto}://${host}`
    const redirectTo = `${origin}/auth/callback?next=/reset-password&type=recovery`

    // Fire-and-forget: even if Supabase returns "user not found", we
    // surface the same ok:true response. This is the standard
    // anti-enumeration pattern (mirrors GitHub / Stripe behaviour).
    await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
    })

    return { ok: true }
}
