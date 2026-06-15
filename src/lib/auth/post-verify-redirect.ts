import { createServiceClient, createClient } from '@/lib/supabase/server'

/**
 * Shared by `/auth/callback` (PKCE `?code=` flow) and the `/auth/confirm`
 * click-to-confirm action (`token_hash` flow) — both call this immediately
 * after a successful `exchangeCodeForSession` / `verifyOtp` to decide where
 * the now-authenticated user should land.
 */
export async function resolvePostVerifyRedirect(input: {
    supabase: Awaited<ReturnType<typeof createClient>>
    type: string | null
    next: string
    origin: string
}): Promise<URL> {
    const { supabase, type, next, origin } = input

    // BRIEF-59 — recovery (forgot-password) flow lands here with a
    // recovery-only session. Don't route to /{slug}/admin: the user
    // hasn't proven they own the password yet (they're resetting it).
    // Send them to /reset-password and let that page complete the loop
    // (updateUser + signOut(global) + redirect to /login).
    if (type === 'recovery') {
        return new URL('/reset-password', origin)
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
    return redirectUrl
}
