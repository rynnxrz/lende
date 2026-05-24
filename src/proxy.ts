import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Path-based multi-tenant routing middleware (Next.js 16 `proxy.ts`).
 *
 * Phase B partial:
 * - Storefront routes (`catalog`, `wholesale`) are physically migrated to
 *   `src/app/[slug]/(storefront)/...`. For those, the URL `/{slug}/{route}`
 *   is served natively by Next.js — middleware just needs to lowercase the
 *   slug and let Next.js route. Any non-existent slug 404s via the page's
 *   own `notFound()`.
 * - Other tenant routes (`admin`, `archive`, `request`, `payment`,
 *   `payment-confirmation`) are still at legacy `src/app/{route}/...`. For
 *   those, middleware preserves Phase A behaviour: `/ivyjstudio/{route}`
 *   rewrites to `/{route}` and forwards the slug via `x-org-slug` header.
 * - Old root-level URLs (`/catalog`, `/wholesale`, `/admin/...`) still
 *   301-redirect to `/{DEFAULT_ORG}/...` so external bookmarks survive.
 *
 * Wholesale gate (merged from former proxy.ts gate): when the visitor
 * hits a catalog URL with `?mode=wholesale` but no auth cookie, bounce
 * them to the matching wholesale gate.
 */

const TENANT_ROUTES = [
    'admin',
    'catalog',
    'archive',
    'wholesale',
    'request',
    'payment',
    'payment-confirmation',
] as const

// Routes whose pages are physically at `src/app/[slug]/(storefront)/{route}`.
// Middleware must NOT rewrite these — let Next.js route to the new files.
const MIGRATED_TENANT_ROUTES = new Set<string>(['catalog', 'wholesale'])

const DEFAULT_ORG = 'ivyjstudio'

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

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname
    const segments = pathname.split('/').filter(Boolean)
    const firstRaw = segments[0]
    const secondRaw = segments[1]
    const first = firstRaw?.toLowerCase()
    const second = secondRaw?.toLowerCase()

    // (0a) Canonicalise to lowercase. URL `/IvyJStudio/catalog` →
    //      301 `/ivyjstudio/catalog`. SEO friendlier and matches DB slug
    //      casing exactly without relying on every callsite to lowercase.
    if (firstRaw && first && firstRaw !== first) {
        const newUrl = request.nextUrl.clone()
        newUrl.pathname = '/' + [first, ...segments.slice(1)].join('/')
        return NextResponse.redirect(newUrl, 301)
    }

    // (0b) Wholesale gate. `/{slug}/catalog?mode=wholesale` with no auth
    //      cookie → `/{slug}/wholesale`. Cookie is per-slug so each org's
    //      wholesale unlock is isolated. Falls back to DEFAULT_ORG for the
    //      legacy root `/catalog?mode=wholesale` URL (which then
    //      301-redirects through branch (1) below).
    const mode = request.nextUrl.searchParams.get('mode')
    if (mode === 'wholesale') {
        const isLegacyCatalog = first === 'catalog' && !second
        const isOrgCatalog = Boolean(first) && !RESERVED_SEGMENTS.has(first as string) && second === 'catalog'
        if (isLegacyCatalog || isOrgCatalog) {
            const gateSlug = isOrgCatalog ? (first as string) : DEFAULT_ORG
            const cookieName = `wholesale_authenticated_${gateSlug}`
            if (request.cookies.get(cookieName)?.value !== 'true') {
                const url = request.nextUrl.clone()
                url.pathname = `/${gateSlug}/wholesale`
                url.search = ''
                return NextResponse.redirect(url)
            }
        }
    }

    // (1) Old root-level tenant URL → 301 to /{DEFAULT_ORG}/...
    if (isTenantRoute(first)) {
        const newUrl = request.nextUrl.clone()
        newUrl.pathname = `/${DEFAULT_ORG}${pathname}`
        return NextResponse.redirect(newUrl, 301)
    }

    // (2) New tenant URL `/{org}/{tenant_route}/...`.
    if (
        first &&
        !RESERVED_SEGMENTS.has(first) &&
        second &&
        isTenantRoute(second)
    ) {
        if (MIGRATED_TENANT_ROUTES.has(second)) {
            // Page is at /[slug]/(storefront)/{route}. Let Next.js route
            // natively; the page itself resolves org via params.slug and
            // calls notFound() if the slug doesn't exist.
            return await updateSession(request)
        }
        // Unmigrated route. Phase A rewrite is still in effect, but only
        // for DEFAULT_ORG until those routes also move.
        if (first === DEFAULT_ORG) {
            const rewritten = request.nextUrl.clone()
            rewritten.pathname = '/' + segments.slice(1).join('/')

            const requestHeaders = new Headers(request.headers)
            requestHeaders.set('x-org-slug', first)

            const response = NextResponse.rewrite(rewritten, {
                request: { headers: requestHeaders },
            })
            response.headers.set('x-org-slug', first)
            return response
        }
        // Non-default org hitting unmigrated route → fall through, 404.
    }

    return await updateSession(request)
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
    ],
}
