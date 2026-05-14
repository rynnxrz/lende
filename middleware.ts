import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Path-based multi-tenant routing middleware.
 *
 * Backward-compatible Phase A delivery for BRIEF-03:
 * - Old root-level tenant URLs (`/admin/*`, `/catalog`, etc.) → 301 redirect
 *   to `/{DEFAULT_ORG}/...` so external bookmarks / emails keep working.
 * - New URL shape `/{org}/...` (e.g. `/ivyjstudio/admin`) → internally
 *   rewritten to existing `/admin/*`, `/catalog/*`, ... handlers, which
 *   still live at the legacy paths in `src/app/`. Org slug is forwarded
 *   via `x-org-slug` header so server code can resolve org context.
 *
 * Phase B (follow-up brief): physical move of `src/app/admin` →
 * `src/app/(internal)/[org]/admin` and `src/app/{catalog,...}` →
 * `src/app/(public)/[org]/...`. When that move lands, the rewrite
 * branches below should be deleted; only the redirect branch stays.
 */

// Routes that belong to a tenant (exclude marketing / auth / api).
const TENANT_ROUTES = [
    'admin',
    'catalog',
    'archive',
    'wholesale',
    'request',
    'payment',
    'payment-confirmation',
] as const

// Single-tenant compat: until org provisioning lands (BRIEF-05),
// every legacy URL belongs to the IVYJSTUDIO org.
// Lower-case to match URL convention; SoT in future will be the
// `organizations.slug` column (00052_organizations_and_membership).
const DEFAULT_ORG = 'ivyjstudio'

// Reserved top-level segments that are NEVER an org slug.
// Anything in this list short-circuits the org rewrite branch.
const RESERVED_SEGMENTS = new Set<string>([
    '',
    'api',
    '_next',
    'login',
    'signup',
    'signin',
    'logout',
    'auth',
    'invite',
    'system-admin',
    'favicon.ico',
    'sitemap.xml',
    'robots.txt',
    'about',
    'pricing',
    'features',
    'demo',
    'contact',
    'case-study',
    'smart-import',
    'docs',
    'changelog',
    'roadmap',
    'legal',
    'legacy',
])

function isTenantRoute(segment: string | undefined): boolean {
    return Boolean(segment) && (TENANT_ROUTES as readonly string[]).includes(segment as string)
}

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname
    const segments = pathname.split('/').filter(Boolean)
    const first = segments[0]
    const second = segments[1]

    // (1) Old root-level tenant URL → 301 to /{DEFAULT_ORG}/...
    //     e.g. `/admin/items` → `/ivyjstudio/admin/items`
    if (isTenantRoute(first)) {
        const newUrl = request.nextUrl.clone()
        newUrl.pathname = `/${DEFAULT_ORG}${pathname}`
        return NextResponse.redirect(newUrl, 301)
    }

    // (2) New tenant URL `/{org}/{tenant_route}/...` → rewrite to
    //     legacy `/{tenant_route}/...` while preserving the org slug
    //     in a request header. Phase A only recognises DEFAULT_ORG;
    //     unknown slugs fall through and 404 (or hit other routes).
    if (
        first &&
        !RESERVED_SEGMENTS.has(first) &&
        second &&
        isTenantRoute(second)
    ) {
        if (first === DEFAULT_ORG) {
            const rewritten = request.nextUrl.clone()
            rewritten.pathname = '/' + segments.slice(1).join('/')

            // Build response that proxies the rewrite + sets x-org-slug
            // for downstream server components / actions.
            const requestHeaders = new Headers(request.headers)
            requestHeaders.set('x-org-slug', first)

            const response = NextResponse.rewrite(rewritten, {
                request: { headers: requestHeaders },
            })
            response.headers.set('x-org-slug', first)
            // Hand off to existing supabase session updater so cookies stay fresh.
            // `updateSession` expects to manage its own response, but for rewrites
            // we keep our rewrite response and let the supabase client refresh
            // happen on the rewritten request through normal app handlers.
            return response
        }
        // Unknown org slug → fall through to default supabase session update;
        // Next.js will produce a 404 because no route file matches.
    }

    // (3) Default path: keep existing supabase session update behaviour.
    return await updateSession(request)
}

/**
 * Apply middleware to all paths except API routes, Next.js internals,
 * and static metadata files. Mirrors the standard Next.js multi-tenant
 * guide matcher.
 */
export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
    ],
}
