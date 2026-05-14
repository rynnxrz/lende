import { test, expect, Page } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * BRIEF-63 — in-session OrgSwitcher e2e.
 *
 * Validates that a user with two organization memberships can switch
 * between them via the Sidebar OrgSwitcher dropdown without signing
 * out. Mirrors the signup-flow.spec.ts setup pattern (service-role
 * test-data seeding + cleanup in afterAll).
 *
 * Coverage:
 *   1. After login the multi-org user lands on /select-workspace,
 *      picks orgA, and the OrgSwitcher trigger renders with
 *      "orgA · owner".
 *   2. Clicking the trigger opens a dropdown listing both workspaces.
 *      Current (orgA) row is highlighted + carries aria-current=true.
 *      The other (orgB) row is clickable.
 *   3. Clicking orgB navigates to /orgB/admin (URL slug flips).
 *   4. Re-opening the dropdown on /orgB/admin shows orgB as the
 *      highlighted current row.
 *
 * Skips when SUPABASE env is missing. Like other e2e specs, requires
 * `npm run dev` running locally and a reachable Supabase project.
 */

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? ''

const skipReason =
    !SUPABASE_URL || !SERVICE_ROLE
        ? 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
        : process.env.SUPABASE_URL_GUARDRAIL === 'production'
          ? 'Refusing to run e2e against production database'
          : ''

const RUN_ID = Date.now().toString(36)
const password = 'brief-63-e2e-pw-12345'
const email = `b63-e2e-${RUN_ID}@example.com`
const slugA = `b63-orga-${RUN_ID}`
const slugB = `b63-orgb-${RUN_ID}`
const nameA = `B63 OrgA ${RUN_ID}`
const nameB = `B63 OrgB ${RUN_ID}`

const createdUserIds: string[] = []
const createdOrgIds: string[] = []

function service(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

async function createOrg(slug: string, name: string): Promise<string> {
    const svc = service()
    const { data, error } = await svc
        .from('organizations')
        .insert({ slug, name, plan: 'trial' })
        .select('id')
        .single()
    if (error || !data) throw new Error(`createOrg failed: ${error?.message}`)
    createdOrgIds.push(data.id as string)
    return data.id as string
}

async function addMember(
    orgId: string,
    userId: string,
    role: 'owner' | 'admin' = 'admin',
): Promise<void> {
    const svc = service()
    const { error } = await svc.from('organization_members').insert({
        organization_id: orgId,
        user_id: userId,
        role,
        accepted_at: new Date().toISOString(),
    })
    if (error) throw new Error(`addMember failed: ${error.message}`)
}

async function login(page: Page, userEmail: string, userPassword: string): Promise<void> {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(userEmail)
    await page.getByLabel(/password/i).fill(userPassword)
    await Promise.all([
        page.waitForURL(/\/(select-workspace|.*admin).*/),
        page.getByRole('button', { name: /sign in|log in/i }).click(),
    ])
}

test.describe.configure({ mode: 'serial' })

test.describe('BRIEF-63 — in-session OrgSwitcher', () => {
    test.skip(!!skipReason, skipReason)

    test.beforeAll(async () => {
        const svc = service()
        const { data: c, error: cErr } = await svc.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        if (cErr || !c.user) throw new Error(`createUser failed: ${cErr?.message}`)
        createdUserIds.push(c.user.id)

        const orgAId = await createOrg(slugA, nameA)
        await addMember(orgAId, c.user.id, 'owner')
        const orgBId = await createOrg(slugB, nameB)
        await addMember(orgBId, c.user.id, 'admin')
    })

    test.afterAll(async () => {
        const svc = service()
        for (const uid of createdUserIds) {
            try {
                await svc.auth.admin.deleteUser(uid)
            } catch {}
        }
        if (createdOrgIds.length) {
            await svc.from('organizations').delete().in('id', createdOrgIds)
        }
    })

    test('multi-org user switches workspaces via Sidebar dropdown', async ({ page }) => {
        // 1. Login. Multi-org user gets routed to /select-workspace
        //    by BRIEF-60's login flow.
        await login(page, email, password)
        await page.waitForURL(/\/select-workspace/)

        // Pick orgA via the BRIEF-60 picker.
        await page.getByRole('button', { name: new RegExp(nameA, 'i') }).click()
        await page.waitForURL(new RegExp(`/${slugA}/admin`))

        // 2. Sidebar OrgSwitcher trigger is rendered (it may be in
        //    collapsed icon-only mode until hover; the test-id is
        //    stable in both states). Hover to expand and read the
        //    org name + role.
        const trigger = page.getByTestId('org-switcher-trigger')
        await expect(trigger).toBeVisible()
        await trigger.hover()
        await expect(trigger).toContainText(nameA)
        await expect(trigger).toContainText(/owner/i)

        // 3. Open the dropdown and assert both workspaces are listed,
        //    current is aria-current=true, other is clickable.
        await trigger.click()
        const menu = page.getByTestId('org-switcher-menu')
        await expect(menu).toBeVisible()

        const currentItem = page.getByTestId('org-switcher-item-current')
        await expect(currentItem).toContainText(nameA)
        await expect(currentItem).toHaveAttribute('aria-current', 'true')

        // The non-current orgB row + the "Add workspace" link both exist.
        const otherItem = page.getByTestId('org-switcher-item').filter({ hasText: nameB })
        await expect(otherItem).toBeVisible()
        await expect(page.getByTestId('org-switcher-add')).toBeVisible()

        // 4. Switch to orgB. URL flips to /<slugB>/admin, no exception.
        await otherItem.click()
        await page.waitForURL(new RegExp(`/${slugB}/admin`))

        // 5. Re-open the dropdown — orgB is now the highlighted current row.
        const triggerAfter = page.getByTestId('org-switcher-trigger')
        await triggerAfter.hover()
        await expect(triggerAfter).toContainText(nameB)
        await triggerAfter.click()
        const currentAfter = page.getByTestId('org-switcher-item-current')
        await expect(currentAfter).toContainText(nameB)
    })
})
