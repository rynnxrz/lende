import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-47 step 3 — Playwright e2e covering the 5-step onboarding flow.
 *
 * Phase A scope (BRIEF-44 phase A — what's shipped):
 *   1. /invite/<token>       page renders, email pre-bound and disabled
 *   2. Set password + submit redirects to /<slug>/admin
 *   3. Tour banner       (phase B1 / BRIEF-48 — react-joyride; skipped here)
 *   4. Empty-state CTA   (phase B1 / BRIEF-48 — sample-data RPC; skipped here)
 *   5. Share-with-team widget visible on dashboard for new (1-member) org
 *
 * Setup uses the service role to seed an organization + invitation, then
 * the test drives the browser through accept → admin landing.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const skipReason =
    !SUPABASE_URL || !SERVICE_ROLE
        ? 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required'
        : process.env.SUPABASE_URL_GUARDRAIL === 'production'
          ? 'Refusing to seed onboarding fixture into production database'
          : ''

const RUN_ID = Date.now().toString(36)
const slug = `e2e-onb-${RUN_ID}`
const orgName = `E2E Onboarding ${RUN_ID}`
const email = `e2e-onb-${RUN_ID}@example.com`
const password = 'onboarding-12345'

let createdOrgId: string | null = null
let createdInvitationId: string | null = null
let createdUserId: string | null = null
let inviteToken: string | null = null

function service() {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-47 onboarding 5-step e2e', () => {
    test.skip(!!skipReason, skipReason)

    test.beforeAll(async () => {
        const svc = service()
        const { data: org, error: orgErr } = await svc
            .from('organizations')
            .insert({ slug, name: orgName, plan: 'trial' })
            .select('id')
            .single()
        if (orgErr || !org) throw new Error(`org seed failed: ${orgErr?.message}`)
        createdOrgId = org.id

        const { data: inv, error: invErr } = await svc
            .from('organization_invitations')
            .insert({
                organization_id: org.id,
                email,
                role: 'admin',
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            })
            .select('id, token')
            .single()
        if (invErr || !inv) throw new Error(`invitation seed failed: ${invErr?.message}`)
        createdInvitationId = inv.id
        inviteToken = inv.token
    })

    test.afterAll(async () => {
        const svc = service()
        if (createdInvitationId) {
            await svc.from('organization_invitations').delete().eq('id', createdInvitationId)
        }
        if (createdUserId) {
            try {
                await svc.auth.admin.deleteUser(createdUserId)
            } catch {}
        }
        if (createdOrgId) {
            await svc.from('organizations').delete().eq('id', createdOrgId)
        }
    })

    test('step 1: /invite/<token> renders with email pre-bound + disabled', async ({ page }) => {
        await page.goto(`/invite/${inviteToken}`)
        await expect(page.getByText(`Join ${orgName}`)).toBeVisible()
        const emailInput = page.locator('#email')
        await expect(emailInput).toHaveValue(email)
        await expect(emailInput).toBeDisabled()
        await expect(page.locator('#password')).toBeVisible()
    })

    test('step 2: submit password redirects to /<slug>/admin', async ({ page }) => {
        await page.goto(`/invite/${inviteToken}`)
        await page.locator('#password').fill(password)
        await Promise.all([
            page.waitForURL(`**/${slug}/admin**`, { timeout: 30_000 }),
            page.getByRole('button', { name: /Accept invitation/i }).click(),
        ])
        await expect(page).toHaveURL(new RegExp(`/${slug}/admin`))
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

        // Capture the auth user id for cleanup
        const svc = service()
        const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 })
        const u = data.users.find((x) => x.email === email)
        if (u) createdUserId = u.id
    })

    test.skip('step 3: tour banner visible + skip dismisses it (BRIEF-48 phase B1)', async () => {
        // react-joyride OnboardingTour wires up in BRIEF-48; the banner +
        // localStorage flag are not yet rendered. Re-enable when phase B1 ships.
    })

    test.skip('step 4: empty-state Add-first-listing CTA (BRIEF-48 phase B1)', async () => {
        // Sample-data seed RPC + empty-state CTA arrive in BRIEF-48 step 4.
    })

    test('step 5: Share-with-team widget visible on a fresh-org dashboard', async ({ page }) => {
        // Playwright tests get a fresh browser context by default (even in
        // serial mode), so the cookie set in step 2 is NOT available here.
        // Sign in explicitly via /login, wait until we're off /login, then
        // navigate to the org's admin URL directly. (The /login page does
        // router.push("/admin") which routes via the legacy admin layout
        // and may bounce around — bypass that by going to /<slug>/admin.)
        await page.goto('/login')
        await page.locator('#email').fill(email)
        await page.locator('#password').fill(password)
        await page.getByRole('button', { name: /Sign in/i }).click()
        await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
        await page.goto(`/${slug}/admin`)
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
            timeout: 10_000,
        })
        // ShareWithTeam card renders when org member count <= 1
        await expect(page.getByText(/Invite your team|Share with team|Add teammate/i)).toBeVisible({
            timeout: 10_000,
        })
    })
})
