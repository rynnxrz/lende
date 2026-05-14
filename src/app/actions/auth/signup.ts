'use server'

import { headers } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { validateSignupShape } from '@/lib/auth/signup-shape'

/**
 * BRIEF-05 — Signup server action (password fallback path).
 * BRIEF-60 — Provisioning logic refactored into the
 * `provisionOrgForNewUser` helper so the new OTP signup path
 * (`signup-otp.ts`) can reuse it. The password signup path remains
 * supported as a fallback (?mode=password on /signup) for users who
 * cannot receive OTP email or who explicitly prefer a password.
 *
 * Flow (password fallback):
 *   1. Validate input (zod-style hand-rolled — kept dep-free).
 *   2. supabase.auth.signUp({ email, password, options: { emailRedirectTo } })
 *   3. provisionOrgForNewUser({ userId, storeName, slug })
 *   4. Return { ok: true, slug } so the client can redirect to
 *      `/{slug}/admin?onboarding=1`.
 *
 * Errors are surfaced as `{ ok: false, error }` — never thrown to the
 * client (server actions serialise thrown errors to "Internal Server
 * Error" in production).
 */

const MAX_SLUG_TRIES = 25
const RESERVED_SLUGS = new Set([
    'admin', 'api', 'app', 'auth', 'billing', 'dashboard', 'docs',
    'help', 'login', 'logout', 'pricing', 'privacy', 'public',
    'select-workspace', 'settings', 'signup', 'static', 'support',
    'terms', 'www',
])

export interface SignupInput {
    email: string
    password: string
    storeName: string
    slug: string
}

export type SignupResult =
    | { ok: true; slug: string; userId: string; emailSent: boolean }
    | { ok: false; error: string; field?: 'email' | 'password' | 'storeName' | 'slug' }

function getOrigin(): string {
    try {
        return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    } catch {
        return 'http://localhost:3000'
    }
}

export async function getOriginAsync(): Promise<string> {
    try {
        const h = await headers()
        const proto = h.get('x-forwarded-proto') ?? 'https'
        const host = h.get('x-forwarded-host') ?? h.get('host')
        if (host) return `${proto}://${host}`
    } catch {
        // headers() not available outside request context — fall through.
    }
    return getOrigin()
}

/**
 * BRIEF-60 — extracted from signupAction. Creates the organization
 * row (with `plan='trial'` + `trial_ends_at = NOW + 14d`), inserts the
 * organization_members(owner) row, and stamps
 * `app_metadata.current_org_id` so the 00054 hook picks it up on the
 * next refreshSession.
 *
 * On failure, the function tries to roll back what it created (best
 * effort) and returns `{ ok: false, error }`. The auth.users row is
 * **not** deleted by this helper — the caller decides whether to
 * orphan-delete the user (signupAction does; signup-otp may not, since
 * the OTP path may want to retain the user for retry).
 *
 * Slug collisions auto-suffix up to MAX_SLUG_TRIES.
 *
 * NOTE: this is a server-only function (uses service role). Never
 * import into a "use client" boundary.
 */
export interface ProvisionOrgInput {
    userId: string
    storeName: string
    slug: string
    /** When true, on hard failure also delete auth.users row to avoid
     *  an orphan (default behaviour for signup paths). */
    rollbackUserOnFailure?: boolean
}

export type ProvisionOrgResult =
    | { ok: true; orgId: string; slug: string }
    | { ok: false; error: string; field?: 'slug' }

export async function provisionOrgForNewUser(
    input: ProvisionOrgInput,
): Promise<ProvisionOrgResult> {
    const { userId, storeName, slug: requestedSlug } = input
    const rollback = input.rollbackUserOnFailure ?? true
    const service = createServiceClient()

    let finalSlug = requestedSlug
    let orgId: string | null = null

    for (let attempt = 0; attempt < MAX_SLUG_TRIES; attempt++) {
        const candidate = attempt === 0 ? requestedSlug : `${requestedSlug}-${attempt + 1}`

        if (attempt === 0 && RESERVED_SLUGS.has(candidate)) {
            return {
                ok: false,
                error: `"${candidate}" is reserved. Please pick a different workspace URL.`,
                field: 'slug',
            }
        }

        const { data, error } = await service
            .from('organizations')
            .insert({
                slug: candidate,
                name: storeName,
                plan: 'trial',
                trial_ends_at: new Date(
                    Date.now() + 14 * 24 * 60 * 60 * 1000
                ).toISOString(),
            })
            .select('id, slug')
            .single()

        if (!error && data) {
            orgId = data.id as string
            finalSlug = data.slug as string
            break
        }

        const code = (error as { code?: string } | null)?.code
        const message = error?.message ?? ''
        if (code === '23505' || /duplicate key|unique constraint/i.test(message)) {
            continue
        }

        if (rollback) {
            await service.auth.admin.deleteUser(userId).catch(() => {})
        }
        return {
            ok: false,
            error: `Could not create workspace: ${message || 'unknown error'}`,
        }
    }

    if (!orgId) {
        if (rollback) {
            await service.auth.admin.deleteUser(userId).catch(() => {})
        }
        return {
            ok: false,
            error:
                'Could not allocate a unique workspace URL after several tries. Please pick a different name.',
            field: 'slug',
        }
    }

    const { error: memberError } = await service
        .from('organization_members')
        .insert({
            organization_id: orgId,
            user_id: userId,
            role: 'owner',
            accepted_at: new Date().toISOString(),
        })

    if (memberError) {
        try { await service.from('organizations').delete().eq('id', orgId) } catch {}
        if (rollback) {
            try { await service.auth.admin.deleteUser(userId) } catch {}
        }
        return {
            ok: false,
            error: `Could not link user to workspace: ${memberError.message}`,
        }
    }

    // Stamp app_metadata.current_org_id so 00054 hook picks it up.
    // Also set last_active_org_id on profiles (00054 col).
    try {
        await service.auth.admin.updateUserById(userId, {
            app_metadata: { current_org_id: orgId },
        })
    } catch {}

    try {
        await service.from('profiles').update({ last_active_org_id: orgId }).eq('id', userId)
    } catch {}

    return { ok: true, orgId, slug: finalSlug }
}

export async function signupAction(input: SignupInput): Promise<SignupResult> {
    const validation = validateSignupShape({
        email: input.email,
        password: input.password,
        storeName: input.storeName,
        slug: input.slug,
        requirePassword: true,
    })
    if (!validation.ok) {
        return { ok: false, error: validation.error, field: validation.field }
    }

    const email = input.email.trim().toLowerCase()
    const password = input.password
    const storeName = input.storeName.trim()
    const requestedSlug = input.slug.trim().toLowerCase()

    const origin = await getOriginAsync()

    // ---------------------------------------------------------------
    // 1. Sign up with email + password (sends verification email).
    // ---------------------------------------------------------------
    const supabase = await createClient()
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback?next=/`,
            data: {
                store_name: storeName,
                requested_slug: requestedSlug,
            },
        },
    })

    if (signUpError) {
        const msg = signUpError.message
        if (/already.*registered/i.test(msg)) {
            return {
                ok: false,
                error:
                    'An account with this email already exists. To create an additional workspace, use the 6-digit code option instead.',
                field: 'email',
            }
        }
        return { ok: false, error: msg }
    }

    const userId = signUpData.user?.id
    if (!userId) {
        return {
            ok: false,
            error: 'Sign-up succeeded but no user id was returned. Please try logging in.',
        }
    }

    const emailSent = signUpData.user?.email_confirmed_at == null

    // ---------------------------------------------------------------
    // 2. Provision organization via the shared helper.
    // ---------------------------------------------------------------
    const prov = await provisionOrgForNewUser({
        userId,
        storeName,
        slug: requestedSlug,
        rollbackUserOnFailure: true,
    })
    if (!prov.ok) {
        return { ok: false, error: prov.error, field: prov.field }
    }

    return {
        ok: true,
        slug: prov.slug,
        userId,
        emailSent,
    }
}

/**
 * BRIEF-05 — resend verification email.
 *
 * Used by the EmailVerificationBanner "Resend" button. Wraps
 * supabase.auth.resend() so the client component doesn't need access
 * to the email itself (we read it from the active session).
 */
export async function resendVerificationEmailAction(): Promise<
    { ok: true } | { ok: false; error: string }
> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email) {
        return { ok: false, error: 'You must be logged in to resend the email.' }
    }
    if (user.email_confirmed_at) {
        return { ok: false, error: 'This email is already verified.' }
    }

    const origin = await getOriginAsync()
    const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: {
            emailRedirectTo: `${origin}/auth/callback?next=/`,
        },
    })

    if (error) {
        return { ok: false, error: error.message }
    }
    return { ok: true }
}
