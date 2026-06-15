'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-59 — Reset password server action.
 *
 * Called from /reset-password after the user has been signed in by the
 * recovery callback (`/auth/callback?type=recovery` →
 * `verifyOtp({ type: 'recovery' })`). The callback redirects the user
 * here with a one-shot session that is **only** authorised to set a new
 * password.
 *
 * Security properties (BRIEF-59 risk #2 mitigation):
 *   - We require an authenticated session (the recovery flow already
 *     created one). If `getUser()` returns null, abort.
 *   - We **always** call `auth.admin.signOut(userId, 'global')` after
 *     `updateUser({ password })`. This invalidates every existing
 *     refresh token + active access token (including any session held
 *     by an attacker who phished the original password). The user is
 *     forced to re-login with the new password.
 *   - The redirect target is `/login?password_reset=1`. The login page
 *     reads the query string and renders a one-time success banner.
 */
export type ResetPasswordResult = { ok: true } | { ok: false; error: string }

export async function invalidateResetSessionsAction(
    accessToken: string,
): Promise<ResetPasswordResult> {
    if (!accessToken) {
        return {
            ok: false,
            error: 'Your reset session has expired. Please request a new link.',
        }
    }

    const verifier = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        },
    )

    const {
        data: { user },
        error: getUserError,
    } = await verifier.auth.getUser(accessToken)

    if (getUserError || !user) {
        return {
            ok: false,
            error: 'Your reset session has expired. Please request a new link.',
        }
    }

    const service = createServiceClient()
    try {
        await service.auth.admin.signOut(user.id, 'global')
    } catch (err) {
        console.error('[reset-password] admin.signOut failed:', err)
        return {
            ok: false,
            error: 'Password updated, but old sessions could not be cleared automatically.',
        }
    }

    return { ok: true }
}

export async function resetPasswordAction(
    newPassword: string,
): Promise<ResetPasswordResult> {
    if (!newPassword || newPassword.length < 8) {
        return { ok: false, error: 'Password must be at least 8 characters.' }
    }

    const supabase = await createClient()

    const {
        data: { user },
        error: getUserError,
    } = await supabase.auth.getUser()

    if (getUserError || !user) {
        return {
            ok: false,
            error: 'Your reset link has expired. Please request a new one.',
        }
    }

    // 1. Update the password on the user's auth row.
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
    })

    if (updateError) {
        return { ok: false, error: updateError.message }
    }

    // 2. Force-invalidate every session for this user (the current one
    //    included). Anyone holding a stale access token must re-login
    //    with the new password.
    const service = createServiceClient()
    try {
        await service.auth.admin.signOut(user.id, 'global')
    } catch (err) {
        // Don't block the user on a sign-out failure — the password is
        // already updated. Log to server stderr so operations can pick
        // it up; the next access-token refresh will still re-issue.
        console.error('[reset-password] admin.signOut failed:', err)
    }

    return { ok: true }
}
