import { readFile } from 'node:fs/promises'
import { test, expect, Page } from '@playwright/test'
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? ''

const skipLiveReason =
    !SUPABASE_URL || !SERVICE_ROLE
        ? 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
        : process.env.SUPABASE_URL_GUARDRAIL === 'production'
          ? 'Refusing to run e2e against production database'
          : ''

const RUN_ID = Date.now().toString(36)
const password = 'auth-recovery-e2e-pw-12345'
const email = `auth-recovery-${RUN_ID}@example.com`
const slug = `auth-recovery-${RUN_ID}`
const orgName = `Auth Recovery ${RUN_ID}`

const createdUserIds: string[] = []
const createdOrgIds: string[] = []

function service(): SupabaseClient {
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

async function loginWithPassword(page: Page) {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in with password instead/i }).click()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await Promise.all([
        page.waitForURL(new RegExp(`/${slug}/admin`)),
        page.getByRole('button', { name: /^sign in$/i }).click(),
    ])
}

test.describe('auth recovery routing', () => {
    test('reset-password without a session shows the expired-link state', async ({ page }) => {
        await page.goto('/reset-password')

        await expect(page.getByRole('heading', { name: /link expired/i })).toBeVisible()
        await expect(
            page.getByRole('link', { name: /request a new reset link/i }),
        ).toHaveAttribute('href', '/forgot-password')
    })

    test('reset-password submit button is not gated by form validity', async () => {
        const source = await readFile(
            'src/app/(marketing)/reset-password/page.tsx',
            'utf8',
        )

        expect(source).toContain('disabled={loading}')
        expect(source).not.toContain('disabled={!canSubmit}')
    })

    test('expired recovery callback redirects to the expired-link state', async ({ page }) => {
        await page.goto('/auth/callback?type=recovery&next=/reset-password')

        await expect(page).toHaveURL(/\/reset-password$/)
        await expect(page.getByRole('heading', { name: /link expired/i })).toBeVisible()
    })

    test('confirm page shows missing-link state without a token_hash', async ({ page }) => {
        await page.goto('/auth/confirm')

        await expect(page.getByRole('heading', { name: /this link is invalid/i })).toBeVisible()
        await expect(
            page.getByRole('link', { name: /request a new link/i }),
        ).toHaveAttribute('href', '/forgot-password')
    })

    test('confirm page renders the click-to-confirm interstitial for recovery', async ({
        page,
    }) => {
        await page.goto('/auth/confirm?token_hash=test-token&type=recovery&next=/reset-password')

        await expect(
            page.getByRole('heading', { name: /confirm password reset/i }),
        ).toBeVisible()
        await expect(page.getByRole('button', { name: /^continue$/i })).toBeVisible()
    })

    test('confirming an invalid recovery token redirects to the expired-link state', async ({
        page,
    }) => {
        await page.goto('/auth/confirm?token_hash=test-token&type=recovery&next=/reset-password')
        await page.getByRole('button', { name: /^continue$/i }).click()

        await expect(page).toHaveURL(/\/reset-password$/)
        await expect(page.getByRole('heading', { name: /link expired/i })).toBeVisible()
    })

    test('legacy root recovery query redirects into the auth callback', async ({ page }) => {
        let callbackUrl: string | null = null
        await page.route('**/auth/callback**', async (route) => {
            callbackUrl = route.request().url()
            await route.fulfill({
                status: 200,
                contentType: 'text/html',
                body: '<!doctype html><title>callback intercepted</title>',
            })
        })

        await page.goto('/?type=recovery&code=fake-code')
        await expect.poll(() => callbackUrl).toContain('/auth/callback')

        const url = new URL(callbackUrl as string)
        expect(url.searchParams.get('type')).toBe('recovery')
        expect(url.searchParams.get('next')).toBe('/reset-password')
        expect(url.searchParams.get('code')).toBe('fake-code')
    })
})

test.describe.configure({ mode: 'serial' })

test.describe('remembered login redirect', () => {
    test.skip(!!skipLiveReason, skipLiveReason)

    test.beforeAll(async () => {
        const svc = service()
        const { data: created, error: createError } = await svc.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        })
        if (createError || !created.user) {
            throw new Error(`createUser failed: ${createError?.message}`)
        }
        createdUserIds.push(created.user.id)

        const { data: org, error: orgError } = await svc
            .from('organizations')
            .insert({ slug, name: orgName, plan: 'trial' })
            .select('id')
            .single()
        if (orgError || !org) {
            throw new Error(`createOrg failed: ${orgError?.message}`)
        }
        createdOrgIds.push(org.id as string)

        const { error: memberError } = await svc.from('organization_members').insert({
            organization_id: org.id,
            user_id: created.user.id,
            role: 'owner',
            accepted_at: new Date().toISOString(),
        })
        if (memberError) {
            throw new Error(`addMember failed: ${memberError.message}`)
        }
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

    test('login page remembers an active session and redirects to the workspace', async ({
        page,
    }) => {
        await loginWithPassword(page)

        await page.goto('/login')
        await expect(
            page.getByRole('heading', { name: /continuing to your workspace/i }),
        ).toBeVisible()
        await page.waitForURL(new RegExp(`/${slug}/admin`))
    })
})
