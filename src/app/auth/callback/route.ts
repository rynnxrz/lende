import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
        const errUrl = new URL('/login', origin)
        errUrl.searchParams.set('error', 'verification_failed')
        if (exchangeError) errUrl.searchParams.set('reason', exchangeError)
        return NextResponse.redirect(errUrl)
    }

    // BRIEF-59 — recovery (forgot-password) flow lands here with a
    // recovery-only session. Don't route to /{slug}/admin: the user
    // hasn't proven they own the password yet (they're resetting it).
    // Send them to /reset-password and let that page complete the loop
    // (updateUser + signOut(global) + redirect to /login).
    if (type === 'recovery') {
        const resetUrl = new URL('/reset-password', origin)
        return NextResponse.redirect(resetUrl)
    }

    // Verification succeeded — find the user's primary org so we can
    // route them to the right `/{slug}/admin` and not the legacy single-
    // tenant `/admin` (which would 301 to the default org and confuse a
    // user who just signed up to a brand-new workspace).
    const {
        data: { user },
    } = await supabase.auth.getUser()

    let slug: string | null = null
    if (user) {
        // Use service role so RLS doesn't get in our way — we just
        // verified this user, so reading their own membership is safe.
        const service = createServiceClient()
        const { data: membership } = await service
            .from('organization_members')
            .select('role, organizations!inner(slug)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()

        const org = (membership as { organizations?: { slug?: string } } | null)?.organizations
        if (org?.slug) slug = org.slug
    }

    const target = slug ? `/${slug}/admin` : next
    const redirectUrl = new URL(target, origin)
    // Surface a small success flag so the banner can self-dismiss /
    // toast can fire on landing.
    redirectUrl.searchParams.set('email_verified', '1')
    return NextResponse.redirect(redirectUrl)
}
