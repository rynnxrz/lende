import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * BRIEF-05 — Signup + onboarding e2e.
 *
 * Covers:
 *   1. /signup form renders and validates
 *   2. Submitting valid input creates the user, the org, and lands on
 *      /{slug}/admin?onboarding=1
 *   3. Email verification banner is visible (since email is unconfirmed)
 *   4. Onboarding wizard is open at step 1
 *   5. Slug auto-suffix: a second signup with the same slug requested
 *      lands on `slug-2`
 *
 * Cleanup runs in afterAll using SUPABASE_SERVICE_ROLE_KEY so a fresh
 * test run doesn't accumulate junk users / orgs in the project.
 *
 * NOTE: this test does NOT require the verification email to be received
 * — exercising the click-link path needs an email-trapping service
 * (Mailpit / Resend test inbox). Banner-disappears-on-link-click is
 * covered by `signup-verify-callback.spec.ts` (TODO follow-up brief).
 */

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? ''

const skipReason =
    !SUPABASE_URL || !SERVICE_ROLE
        ? 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
        : ''

const RUN_ID = Date.now().toString(36)
const baseSlug = `e2e${RUN_ID}`
const baseStoreName = `E2E Studio ${RUN_ID}`
const password = 'testpass-12345'
const emailA = `e2e-${RUN_ID}-a@example.com`
const emailB = `e2e-${RUN_ID}-b@example.com`

const createdUserIds: string[] = []
const createdOrgIds: string[] = []

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-05 signup flow', () => {
    test.skip(!!skipReason, skipReason)

    test('signup form validates required fields', async ({ page }) => {
        await page.goto('/signup')
        await expect(page.getByRole('heading', { name: /14-day trial/i })).toBeVisible()

        const submit = page.getByRole('button', { name: /create workspace/i })
        await expect(submit).toBeDisabled()

        await page.getByLabel('Work email').fill('not-an-email')
        await page.getByLabel('Password').fill('short')
        await page.getByLabel('Studio name').fill('A')
        // Submit still disabled because password too short and slug too short.
        await expect(submit).toBeDisabled()
    })

    test('creates user + org and lands on /{slug}/admin?onboarding=1', async ({
        page,
    }) => {
        await page.goto('/signup')
        await page.getByLabel('Work email').fill(emailA)
        await page.getByLabel('Password').fill(password)
        await page.getByLabel('Studio name').fill(baseStoreName)

        const submit = page.getByRole('button', { name: /create workspace/i })
        await expect(submit).toBeEnabled()

        await Promise.all([
            page.waitForURL(new RegExp(`/${baseSlug}/admin\\?onboarding=1`)),
            submit.click(),
        ])

        // Email verification banner is up.
        await expect(page.getByTestId('email-verification-banner')).toBeVisible()
        await expect(page.getByTestId('email-verification-banner')).toContainText(
            emailA
        )

        // Onboarding wizard is open at step 1.
        await expect(page.getByTestId('onboarding-wizard')).toBeVisible()
        await expect(page.getByTestId('onboarding-wizard')).toContainText('Step 1 of 4')
    })

    test('slug collision auto-suffixes to -2', async ({ page }) => {
        // Override the default slug-derivation by typing in the slug field.
        await page.goto('/signup')
        await page.getByLabel('Work email').fill(emailB)
        await page.getByLabel('Password').fill(password)
        await page.getByLabel('Studio name').fill(`${baseStoreName} Two`)

        // Force slug back to the same as user A.
        const slugInput = page.locator('#slug')
        await slugInput.click()
        await slugInput.fill(baseSlug)

        const submit = page.getByRole('button', { name: /create workspace/i })
        await Promise.all([
            page.waitForURL(new RegExp(`/${baseSlug}-2/admin\\?onboarding=1`)),
            submit.click(),
        ])

        await expect(page.getByTestId('email-verification-banner')).toBeVisible()
    })
})

test.afterAll(async () => {
    if (skipReason) return
    const client = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // Find users by email so cleanup is robust to test failures (no
    // pre-populated id list needed).
    for (const email of [emailA, emailB]) {
        const { data } = await client.auth.admin.listUsers()
        const found = data.users.find((u) => u.email === email)
        if (found) createdUserIds.push(found.id)
    }

    // Find orgs by slug pattern.
    const { data: orgs } = await client
        .from('organizations')
        .select('id')
        .like('slug', `${baseSlug}%`)
    if (orgs) for (const o of orgs) createdOrgIds.push(o.id as string)

    // Delete orgs first (cascades members / business rows). Then users.
    for (const id of createdOrgIds) {
        await client.from('organizations').delete().eq('id', id).catch(() => {})
    }
    for (const id of createdUserIds) {
        await client.auth.admin.deleteUser(id).catch(() => {})
    }
})
