import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * BRIEF-60 — day-14 paywall (D37 hard freeze).
 *
 * For requests targeting `/<slug>/admin/*`:
 *   - look up `organizations` by slug (service-role bypass-RLS read,
 *     since the user may not yet have a JWT scoped to that org),
 *   - if `trial_ends_at < NOW()` AND `subscription_status` IS NULL or
 *     'trialing':
 *       - GET / HEAD: pass through but stamp `X-Trial-Status: expired`
 *         on the response so the layout can show a top banner.
 *       - POST/PATCH/PUT/DELETE: 302 redirect to
 *         `/<slug>/billing/add-card?reason=trial_ended`.
 *
 * NOTE: read-vs-write split keeps the user's data viewable forever.
 * The org row is preserved 90 days after expiry (BRIEF-61 deactivate
 * action). 90+ days is a separate archive job.
 *
 * The org lookup uses the SUPABASE service role (not the user's session)
 * because we need to compare trial status before the request even hits
 * a route handler. We deliberately scope the lookup by exact slug match
 * to keep the row count == 1.
 */

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

// BRIEF-61 — throttle profiles.last_active_at update to ≥ 5 min between
// writes per user, tracked via the LAST_ACTIVE_COOKIE.
const LAST_ACTIVE_COOKIE = 'lende_la'
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 重要：必须调用 getUser() 来触发 session 刷新
    const { data: { user } } = await supabase.auth.getUser()

    // BRIEF-61 — last_active_at update (throttled). Fires only when the
    // user is authenticated AND the throttle cookie is missing or stale.
    // The DB write is fire-and-forget so we don't slow down the response.
    if (user) {
        const cookieValue = request.cookies.get(LAST_ACTIVE_COOKIE)?.value
        const cookieTs = cookieValue ? Number(cookieValue) : 0
        const stale = !cookieTs || Date.now() - cookieTs > LAST_ACTIVE_THROTTLE_MS
        if (stale) {
            const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
            if (serviceKey && supabaseUrl) {
                try {
                    const { createClient: createSvc } = await import('@supabase/supabase-js')
                    const svc = createSvc(supabaseUrl, serviceKey, {
                        auth: { autoRefreshToken: false, persistSession: false },
                    })
                    void svc
                        .from('profiles')
                        .update({ last_active_at: new Date().toISOString() })
                        .eq('id', user.id)
                        .then(({ error }) => {
                            if (error) {
                                console.error(
                                    '[middleware] last_active_at update failed',
                                    error.message
                                )
                            }
                        })
                } catch (err) {
                    console.error('[middleware] last_active_at import failed', err)
                }
            }
            supabaseResponse.cookies.set(LAST_ACTIVE_COOKIE, String(Date.now()), {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24,
                path: '/',
            })
        }
    }

    // Route protection: /admin and /[slug]/admin
    const pathname = request.nextUrl.pathname
    const isAdminRoute = pathname.startsWith('/admin')
    const isOrgAdminRoute = /^\/[^/]+\/admin(\/|$)/.test(pathname)

    if ((isAdminRoute || isOrgAdminRoute) && !user) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // BRIEF-60 — day-14 paywall (only for org-scoped admin routes; the
    // legacy /admin path is the single-tenant fallback that already
    // routes elsewhere). We deliberately fail open if the org lookup
    // errors so a transient DB hiccup never locks paying customers out.
    if (isOrgAdminRoute && user) {
        const slugMatch = pathname.match(/^\/([^/]+)\/admin/)
        const slug = slugMatch?.[1]
        // Skip the billing pages themselves — otherwise the redirect
        // loops on /<slug>/billing/add-card.
        const isBillingPath = /^\/[^/]+\/billing(\/|$)/.test(pathname)
        if (slug && !isBillingPath) {
            const verdict = await checkTrialStatus(slug)
            if (verdict === 'expired') {
                if (MUTATING_METHODS.has(request.method)) {
                    const url = request.nextUrl.clone()
                    url.pathname = `/${slug}/billing/add-card`
                    url.searchParams.set('reason', 'trial_ended')
                    return NextResponse.redirect(url)
                }
                supabaseResponse.headers.set('X-Trial-Status', 'expired')
            } else if (verdict === 'trialing') {
                supabaseResponse.headers.set('X-Trial-Status', 'trialing')
            }
        }
    }

    return supabaseResponse
}

type TrialVerdict = 'trialing' | 'expired' | 'paid' | 'unknown'

/**
 * Service-role read of `organizations.{trial_ends_at, subscription_status}`
 * for the given slug. Returns:
 *   - 'expired' when trial_ends_at < NOW() AND subscription_status IS NULL
 *     or 'trialing'
 *   - 'trialing' when trial_ends_at >= NOW() AND subscription_status IN
 *     (NULL, 'trialing')
 *   - 'paid' when subscription_status NOT IN (NULL, 'trialing')
 *   - 'unknown' on any error or missing row (caller must fail-open).
 *
 * We dynamically import @supabase/supabase-js inside the function so
 * the middleware bundle stays small and we don't pull service-role
 * keys onto the edge unless needed.
 */
async function checkTrialStatus(slug: string): Promise<TrialVerdict> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return 'unknown'

    try {
        const { createClient } = await import('@supabase/supabase-js')
        const svc = createClient(url, key, {
            auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data, error } = await svc
            .from('organizations')
            .select('trial_ends_at, subscription_status')
            .eq('slug', slug)
            .maybeSingle()
        if (error || !data) return 'unknown'

        type Row = {
            trial_ends_at: string | null
            subscription_status: string | null
        }
        const row = data as Row
        const status = (row.subscription_status ?? '').toLowerCase()
        if (status && status !== 'trialing') {
            return 'paid'
        }

        if (!row.trial_ends_at) {
            return 'unknown'
        }
        const ends = Date.parse(row.trial_ends_at)
        if (Number.isNaN(ends)) return 'unknown'
        return ends < Date.now() ? 'expired' : 'trialing'
    } catch {
        return 'unknown'
    }
}
