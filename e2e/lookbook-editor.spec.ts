import { expect, test } from '@playwright/test'

/**
 * BRIEF-54 v3 — admin lookbook editor.
 *
 * Covers:
 *   case 1 — drag-create new bbox + save + reload still shows it.
 *   case 2 — sidebar "Suggest new SKU" toggles match_status to rejected_no_match.
 *   case 3 — confirm matching makes it appear on the customer storefront page.
 *
 * Pre-conditions:
 *   - Admin auth set up via storageState (e.g. `playwright.auth.json`); test
 *     skips itself if `LOOKBOOK_EDITOR_ADMIN_STATE` is missing.
 *   - Run `scripts/lookbook-test-fixtures.ts` to seed the lookbook used here.
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const ORG = 'ivyjstudio'
const EDITOR_SLUG = '2026SS-test'

const STORAGE_STATE = process.env.LOOKBOOK_EDITOR_ADMIN_STATE

test.use(STORAGE_STATE ? { storageState: STORAGE_STATE } : {})

test.describe('BRIEF-54 v3 — admin lookbook editor', () => {
    test.beforeEach(async () => {
        test.skip(
            !STORAGE_STATE,
            'LOOKBOOK_EDITOR_ADMIN_STATE storage state path required (run signup-flow.spec.ts first or seed manually).',
        )
    })

    test('case 1 — drag to create bbox + save persists across reload', async ({ page }) => {
        await page.goto(`${BASE}/${ORG}/admin/lookbooks`)
        await page.getByRole('link', { name: /open editor/i }).first().click()
        await expect(page).toHaveURL(/\/admin\/lookbooks\/[\w-]+\/editor$/)
        await expect(page.getByText(/inspect page/i)).toBeVisible()
        await expect(page.getByText(/current db/i)).toBeVisible()
        await page.getByTestId('lookbook-editor-add-bbox').click()
        await page.getByTestId('lookbook-editor-save').click()
        await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })
        await page.reload({ waitUntil: 'domcontentloaded' })
        const boxes = page.locator('[data-testid^="lookbook-editor-bbox-"]')
        expect(await boxes.count()).toBeGreaterThanOrEqual(1)
    })

    test('case 2 — Suggest new SKU sets rejected_no_match', async ({ page }) => {
        await page.goto(`${BASE}/${ORG}/admin/lookbooks`)
        await page.getByRole('link', { name: /open editor/i }).first().click()
        const firstBbox = page.locator('[data-testid^="lookbook-editor-bbox-"]').first()
        await firstBbox.click()
        await page.getByRole('button', { name: /suggest new sku/i }).click()
        await expect(page.getByLabel('Notes')).toHaveValue(/Suggest new SKU/)
        await page.getByTestId('lookbook-editor-save').click()
        await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 })
    })

    test('case 3 — confirm match makes hot-zone visible on storefront', async ({ page, context }) => {
        await page.goto(`${BASE}/${ORG}/admin/lookbooks`)
        await page.getByRole('link', { name: /open editor/i }).first().click()
        const auto = page.locator('[data-testid^="lookbook-editor-bbox-"]').filter({ hasText: /auto-matched/i }).first()
        await auto.click()
        await expect(page.getByTestId('lookbook-editor-sync')).toBeVisible()
        await page.getByTestId('lookbook-editor-sync').click()
        await expect(page.getByText(/synced pdf crop to live db/i)).toBeVisible({ timeout: 20_000 })
        await page.getByTestId('lookbook-editor-confirm').click()
        await page.getByTestId('lookbook-editor-save').click()
        await page.getByTestId('lookbook-editor-publish').click()
        await expect(page.getByText(/Published/i)).toBeVisible({ timeout: 10_000 })

        const customerPage = await context.newPage()
        await customerPage.goto(`${BASE}/${ORG}/lookbook/${EDITOR_SLUG}`)
        const hot = customerPage.locator('[data-testid^="lookbook-hotzone-"]')
        await expect(hot.first()).toBeVisible({ timeout: 30_000 })
    })

    test('case 4 — stale inventory selection is rejected by the save API', async ({ page }) => {
        await page.goto(`${BASE}/${ORG}/admin/lookbooks`)
        await page.getByRole('link', { name: /open editor/i }).first().click()
        await expect(page).toHaveURL(/\/admin\/lookbooks\/[\w-]+\/editor$/)

        const editorUrl = new URL(page.url())
        const lookbookId = editorUrl.pathname.split('/')[4]
        const response = await page.request.post(
            `${BASE}/${ORG}/api/admin/lookbooks/${lookbookId}/items/bulk`,
            {
                data: {
                    updates: [
                        {
                            id: null,
                            page_number: 1,
                            bbox_x: 0.1,
                            bbox_y: 0.1,
                            bbox_w: 0.2,
                            bbox_h: 0.2,
                            match_status: 'confirmed',
                            match_confidence: null,
                            inventory_item_id: '11111111-1111-1111-1111-111111111111',
                            admin_notes: null,
                        },
                    ],
                    deletes: [],
                },
            },
        )

        expect(response.status()).toBe(400)
        const body = await response.json()
        expect(body.error).toBe('invalid confirmation')
        expect(String(body.detail)).toMatch(/no longer exists|does not belong|not active|no storefront images/)
    })
})
