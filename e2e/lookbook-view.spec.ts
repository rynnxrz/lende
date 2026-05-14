import { expect, test } from '@playwright/test'

/**
 * BRIEF-54 v3 — customer-facing lookbook page (`/{org}/lookbook/{slug}`).
 *
 * Covers:
 *   case 1 — unpublished lookbook 404s for the public.
 *   case 2 — a published lookbook renders, hot-zones exist, click reveals the popover with a working "View & Reserve" link.
 *   case 3 — same page on a 390 px mobile viewport: hot-zone clicks still hit the popover.
 *   case 4 — cross-tenant lookup: /{other-org}/lookbook/{slug-from-org-A} 404s.
 *
 * These tests assume:
 *   - Local Supabase + Next dev server are running with BASE_URL=http://localhost:3000.
 *   - `npm run dev` is up; ivyjstudio org has a draft lookbook slug=`2026SS-draft`
 *     (created by `tracker/brief-54-test-fixtures.sql`) and a published one at
 *     slug=`2026SS-test` with at least one auto_matched item.
 *
 * Required runtime fixture seeding step:
 *   npx tsx scripts/lookbook-test-fixtures.ts
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const ORG = 'ivyjstudio'
// Slugs configurable via env so the same spec works against a fresh local
// fixture or against prod once the migration is pushed.
const PUBLISHED_SLUG = process.env.LOOKBOOK_PUBLISHED_SLUG ?? '2026SS'
const DRAFT_SLUG = process.env.LOOKBOOK_DRAFT_SLUG ?? '2026SS-draft'
const OTHER_ORG = process.env.LOOKBOOK_OTHER_ORG ?? 'pgtap-rls-b'

test.describe('BRIEF-54 v3 — customer lookbook view', () => {
    test('case 1 — unpublished lookbook returns 404', async ({ page }) => {
        const res = await page.goto(`${BASE}/${ORG}/lookbook/${DRAFT_SLUG}`, { waitUntil: 'domcontentloaded' })
        expect(res?.status()).toBe(404)
    })

    test('case 2 — desktop: hot-zone reveals popover with View & Reserve link', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 })
        const res = await page.goto(`${BASE}/${ORG}/lookbook/${PUBLISHED_SLUG}`, { waitUntil: 'domcontentloaded' })
        expect(res?.status()).toBe(200)
        const hotZones = page.locator('[data-testid^="lookbook-hotzone-"]')
        await expect(hotZones.first()).toBeVisible({ timeout: 30_000 })
        await hotZones.first().click()
        const reserveLink = page.getByRole('link', { name: /view & reserve/i })
        await expect(reserveLink).toBeVisible()
        const href = await reserveLink.getAttribute('href')
        expect(href).toMatch(new RegExp(`/${ORG}/catalog/`))
    })

    test('case 3 — mobile 390 viewport: hot-zone still clickable, popover renders', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        const res = await page.goto(`${BASE}/${ORG}/lookbook/${PUBLISHED_SLUG}`, { waitUntil: 'domcontentloaded' })
        expect(res?.status()).toBe(200)
        const hotZones = page.locator('[data-testid^="lookbook-hotzone-"]')
        await expect(hotZones.first()).toBeVisible({ timeout: 30_000 })
        const box = await hotZones.first().boundingBox()
        expect(box).not.toBeNull()
        // 44px hit area enforced by min-width/min-height inline style.
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
        await hotZones.first().click()
        await expect(page.getByRole('link', { name: /view & reserve/i })).toBeVisible()
    })

    test('case 4 — cross-tenant: org B URL with org A slug returns 404', async ({ page }) => {
        const res = await page.goto(`${BASE}/${OTHER_ORG}/lookbook/${PUBLISHED_SLUG}`, { waitUntil: 'domcontentloaded' })
        expect(res?.status()).toBe(404)
    })
})
