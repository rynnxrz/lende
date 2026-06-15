import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePostVerifyRedirect } from '@/lib/auth/post-verify-redirect'

/**
 * BRIEF-05 — Email verification callback.
 *
 * Supabase emits two flavours of verification link, depending on the
 * project's Auth settings:
 *
 *   1. PKCE / code flow (newer):
 *        ?code=<one-time-code>
 *      → exchange via `auth.exchangeCodeForSession(code)`.
 *
 *   2. Implicit / token_hash flow (legacy magic-link style):
 *        ?token_hash=<hash>&type=signup|email|invite|recovery
 *      → exchange via `auth.verifyOtp({ token_hash, type })`.
 *
 * We support both so the same emailRedirectTo URL works whether the
 * underlying project uses code-grant or token-hash. After verification
 * we redirect to the user's primary org admin (with `?onboarding=1`
 * if the user appears to still be in their first session) or to `/login`
 * on failure.
 */
export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    const next = searchParams.get('next') || '/'

    const supabase = await createClient()

    let exchanged = false
    let exchangeError: string | null = null

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
            exchangeError = error.message
        } else {
            exchanged = true
        }
    } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'signup' | 'email' | 'invite' | 'recovery' | 'magiclink' | 'email_change',
        })
        if (error) {
            exchangeError = error.message
        } else {
            exchanged = true
        }
    } else {
        exchangeError = 'Missing verification parameters.'
    }

    if (!exchanged) {
        // Recovery links commonly fail with Supabase appending the real
        // error (e.g. otp_expired) as a URL *fragment*, which a server
        // route can never see — so `exchangeError` here is just our
        // generic "Missing verification parameters." Send recovery
        // failures to /reset-password, which already shows a "Link
        // expired" state with a CTA to request a new one.
        if (type === 'recovery') {
            return NextResponse.redirect(new URL('/reset-password', origin))
        }

        const errUrl = new URL('/login', origin)
        errUrl.searchParams.set('error', 'verification_failed')
        if (exchangeError) errUrl.searchParams.set('reason', exchangeError)
        return NextResponse.redirect(errUrl)
    }

    const redirectUrl = await resolvePostVerifyRedirect({ supabase, type, next, origin })
    return NextResponse.redirect(redirectUrl)
}
