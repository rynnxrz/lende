'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolvePostVerifyRedirect } from '@/lib/auth/post-verify-redirect'

export type ConfirmAuthType = 'recovery' | 'signup' | 'email_change'

/**
 * Click-to-confirm action for `/auth/confirm`.
 *
 * Supabase's `/auth/v1/verify` endpoint consumes the one-time token on a
 * plain `GET` — so an email scanner (e.g. Gmail link-prefetch) that visits
 * the link in the email body consumes it before the real user clicks,
 * leaving the user with `otp_expired`.
 *
 * The fix: the email links to `/auth/confirm?token_hash=...&type=...`,
 * which renders a button but does NOT call `verifyOtp`. Only this action —
 * triggered by the user's real click on that page — calls `verifyOtp` and
 * consumes the token. The email body never contains this URL, so scanners
 * can't trigger it.
 */
export async function confirmAuthAction(formData: FormData) {
    const tokenHash = String(formData.get('token_hash') ?? '')
    const type = String(formData.get('type') ?? '') as ConfirmAuthType
    const next = String(formData.get('next') ?? '/')

    const hdrs = await headers()
    const proto = hdrs.get('x-forwarded-proto') ?? 'https'
    const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? 'lende.shipbyx.com'
    const origin = `${proto}://${host}`

    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

    if (error) {
        if (type === 'recovery') {
            redirect('/reset-password')
        }
        const errUrl = new URL('/login', origin)
        errUrl.searchParams.set('error', 'verification_failed')
        errUrl.searchParams.set('reason', error.message)
        redirect(errUrl.toString())
    }

    const redirectUrl = await resolvePostVerifyRedirect({ supabase, type, next, origin })
    redirect(redirectUrl.toString())
}
