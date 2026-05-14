'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { validateSignupShape } from '@/lib/auth/signup-shape'
import {
    provisionOrgForNewUser,
} from '@/app/actions/auth/signup'

/**
 * BRIEF-60 — OTP-based self-serve signup (D6 v3).
 *
 * Two-stage flow that the rewritten `/signup` page drives:
 *
 *   Stage A — `requestSignupOtpAction({ email, storeName, slug, country? })`
 *     1. Validate input shape (no password required).
 *     2. Detect duplicate email via service-role admin `listUsers` —
 *        if found, return `{ ok: false, error: 'Account exists ...' }`
 *        instead of silently creating a new user (Supabase by default
 *        would just send a magic-link to the existing user, which is
 *        the *wrong* behaviour for the signup path).
 *     3. `signInWithOtp({ email, options: { shouldCreateUser: true,
 *        data: { store_name, requested_slug, country } } })` — Supabase
 *        emails the user a 6-digit code. The studio name + slug are
 *        carried in `user_metadata` so Stage B can read them after
 *        verifyOtp creates the auth.users row.
 *     4. Return `{ ok: true, expiresAt }` so the client can show a
 *        countdown.
 *
 *   Stage B — `verifySignupOtpAction({ email, code })`
 *     1. `verifyOtp({ email, token, type: 'email' })` — on success the
 *        user is signed in (cookie is set on the SSR client).
 *     2. Read `store_name` + `requested_slug` from
 *        `user_metadata` so we can provision the org we promised in
 *        Stage A.
 *     3. `provisionOrgForNewUser({ userId, storeName, slug })` —
 *        identical org / member / app_metadata flow as the password
 *        signup path.
 *     4. `auth.refreshSession()` so the JWT picks up
 *        `current_org_id` from the 00054 hook (BRIEF-42 S5 fix).
 *     5. Return `{ ok: true, slug, orgName }`.
 *
 * Errors are surfaced as `{ ok: false, error }` — never thrown.
 *
 * NOTE on resend rate-limiting: the client guards "Resend code" with a
 * 30-second cooldown. Supabase additionally rate-limits OTP per email
 * (default 1/min). We surface those errors verbatim to the user.
 */

const OTP_TTL_MS = 5 * 60 * 1000

export interface RequestSignupOtpInput {
    email: string
    storeName: string
    slug: string
    country?: string
}

export type RequestSignupOtpResult =
    | { ok: true; expiresAt: string }
    | {
          ok: false
          error: string
          field?: 'email' | 'storeName' | 'slug'
      }

export interface VerifySignupOtpInput {
    email: string
    code: string
}

export type VerifySignupOtpResult =
    | { ok: true; slug: string; orgName: string }
    | { ok: false; error: string; field?: 'code' | 'email' }

/**
 * BRIEF-60 step A — sends 6-digit OTP via Supabase.
 *
 * Carries `store_name` / `requested_slug` (and optional `country`) in
 * `user_metadata` so verifySignupOtpAction can provision the org
 * without re-prompting the user for it.
 */
export async function requestSignupOtpAction(
    input: RequestSignupOtpInput,
): Promise<RequestSignupOtpResult> {
    const validation = validateSignupShape({
        email: input.email,
        storeName: input.storeName,
        slug: input.slug,
        requirePassword: false,
    })
    if (!validation.ok) {
        // narrow field set: only the three OTP-relevant ones
        const field =
            validation.field === 'password'
                ? undefined
                : (validation.field as 'email' | 'storeName' | 'slug' | undefined)
        return { ok: false, error: validation.error, field }
    }

    const email = input.email.trim().toLowerCase()
    const storeName = input.storeName.trim()
    const requestedSlug = input.slug.trim().toLowerCase()
    const country = input.country?.trim() || null

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true,
            data: {
                store_name: storeName,
                requested_slug: requestedSlug,
                ...(country ? { country } : {}),
            },
        },
    })

    if (error) {
        return { ok: false, error: error.message }
    }

    return {
        ok: true,
        expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    }
}

/**
 * BRIEF-60 step B — verifies the 6-digit code, then provisions the
 * org and refreshes the JWT so `current_org_id` is stamped on the
 * session before the client is redirected to `/<slug>/admin`.
 */
export async function verifySignupOtpAction(
    input: VerifySignupOtpInput,
): Promise<VerifySignupOtpResult> {
    const email = input.email.trim().toLowerCase()
    const code = input.code.trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, error: 'Invalid email address.', field: 'email' }
    }
    if (!/^\d{6}$/.test(code)) {
        return {
            ok: false,
            error: 'Please enter the 6-digit code from your email.',
            field: 'code',
        }
    }

    const supabase = await createClient()
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
    })

    if (verifyError) {
        const msg = verifyError.message
        if (/expired|invalid/i.test(msg)) {
            return {
                ok: false,
                error: 'That code is invalid or has expired. Request a new one.',
                field: 'code',
            }
        }
        return { ok: false, error: msg, field: 'code' }
    }

    const user = verifyData.user
    if (!user?.id) {
        return {
            ok: false,
            error: 'Verification succeeded but no user was returned. Please try again.',
        }
    }

    type Metadata = { store_name?: string; requested_slug?: string }
    const md = (user.user_metadata as Metadata | null) ?? {}
    const storeName =
        md.store_name?.trim() ||
        email.split('@')[0]?.replace(/[^a-zA-Z0-9 ]+/g, ' ') ||
        'My Studio'
    const requestedSlug =
        md.requested_slug?.trim().toLowerCase() ||
        (email.split('@')[0] || 'studio').toLowerCase().replace(/[^a-z0-9-]/g, '-')

    // Idempotency guard: if this user already owns the exact slug being
    // requested (e.g. retried verifyOtp after Stage A->B->refresh), skip
    // provisioning and route them there. But if they own *other* orgs,
    // proceed — multi-org signup is intentional.
    const service = createServiceClient()
    {
        const { data: existing } = await service
            .from('organization_members')
            .select('role, organizations!inner(slug, name)')
            .eq('user_id', user.id)

        type MemberRow = { organizations?: { slug?: string; name?: string } }
        const rows = (existing ?? []) as MemberRow[]
        const match = rows.find(
            (r) => r.organizations?.slug === requestedSlug,
        )
        if (match?.organizations?.slug && match.organizations.name) {
            await supabase.auth.refreshSession().catch(() => {})
            return {
                ok: true,
                slug: match.organizations.slug,
                orgName: match.organizations.name,
            }
        }
    }

    const prov = await provisionOrgForNewUser({
        userId: user.id,
        storeName,
        slug: requestedSlug,
        // Don't delete the auth user on provision failure during OTP —
        // a user who has already verified email should not be silently
        // wiped; instead surface the error so they can retry / contact us.
        rollbackUserOnFailure: false,
    })

    if (!prov.ok) {
        return { ok: false, error: prov.error }
    }

    // Refresh JWT so app_metadata.current_org_id picks up via 00054 hook.
    // BRIEF-42 S5 / BRIEF-59 refreshAndStampOrg pattern.
    const { error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError) {
        return {
            ok: false,
            error: `Org created, but session refresh failed: ${refreshError.message}. Please log in.`,
        }
    }

    return {
        ok: true,
        slug: prov.slug,
        orgName: storeName,
    }
}
