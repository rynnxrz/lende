import { test, expect } from '@playwright/test'

/**
 * BRIEF-03 Phase A — path-based routing redirect & rewrite contract.
 *
 * These tests assert the URL-level behaviour added in Phase A:
 *   1. Old root-level tenant URLs (`/admin`, `/catalog`, ...) issue a
 *      301 redirect to `/{DEFAULT_ORG}/...`.
 *   2. New tenant URLs `/{org}/{tenant_route}/...` resolve (via
 *      middleware rewrite) to the legacy handlers.
 *   3. The marketing landing at `/` and the global auth pages
 *      (`/login`, `/signup`) are NOT touched by tenant routing.
 *
 * To run:
 *   npm i -D @playwright/test
 *   npx playwright install chromium
 *   npm run dev    # in another terminal
 *   npx playwright test e2e/path-based-routing.spec.ts
 *
 * NOTE: this file is committed before `@playwright/test` is added to
 * devDependencies, because the cowork sandbox cannot install browsers
 * via egress whitelist. Rongze (or a follow-up brief) wires up the
 * harness when it lands locally / in CI.
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const DEFAULT_ORG = 'ivyjstudio'

test.describe('BRIEF-03 path-based routing — redirect old → new', () => {
    for (const oldPath of ['/admin', '/admin/items', '/catalog', '/wholesale', '/archive', '/request']) {
        test(`${oldPath} → 301 to /${DEFAULT_ORG}${oldPath}`, async ({ request }) => {
            const res = await request.get(`${BASE}${oldPath}`, {
                maxRedirects: 0,
                failOnStatusCode: false,
            })
            expect(res.status()).toBe(301)
            expect(res.headers()['location']).toContain(`/${DEFAULT_ORG}${oldPath}`)
        })
    }
})

test.describe('BRIEF-03 path-based routing — new URL serves legacy handler', () => {
    test('/ivyjstudio/admin renders without auth crash (login redirect ok)', async ({ page }) => {
        const res = await page.goto(`${BASE}/${DEFAULT_ORG}/admin`)
        // Without auth, expect a redirect to /login OR a 200 with admin shell.
        // Either way, the rewrite resolved successfully (no 404).
        expect(res?.status()).toBeLessThan(500)
        // The URL after navigation should be either /login (unauth) or
        // /{org}/admin (rewrite resolved). It must NOT be a 404 page.
        await expect(page).not.toHaveTitle(/404|not found/i)
    })

    test('/ivyjstudio/catalog returns the public catalog page', async ({ page }) => {
        const res = await page.goto(`${BASE}/${DEFAULT_ORG}/catalog`)
        expect(res?.status()).toBeLessThan(500)
        // Catalog is anon-accessible; expect the catalog listing component to mount.
        // Loose check — just ensure something rendered with no crash.
        await expect(page.locator('body')).toBeVisible()
    })
})

test.describe('BRIEF-03 path-based routing — non-tenant routes untouched', () => {
    test('/ marketing landing not redirected', async ({ request }) => {
        const res = await request.get(`${BASE}/`, {
            maxRedirects: 0,
            failOnStatusCode: false,
        })
        expect([200, 304]).toContain(res.status())
    })

    test('/login not redirected', async ({ request }) => {
        const res = await request.get(`${BASE}/login`, {
            maxRedirects: 0,
            failOnStatusCode: false,
        })
        expect([200, 304]).toContain(res.status())
    })

    test('/signup not redirected', async ({ request }) => {
        const res = await request.get(`${BASE}/signup`, {
            maxRedirects: 0,
            failOnStatusCode: false,
        })
        expect([200, 304]).toContain(res.status())
    })
})
