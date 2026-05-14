import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for E2E tests.
 *
 * Originally added by BRIEF-03 for path-based routing. Extended by
 * BRIEF-05 to also run signup-flow.spec.ts. Still requires Rongze to
 * install Playwright locally — cowork sandbox can't fetch the
 * browser binaries.
 *
 * Local setup:
 *   npm i -D @playwright/test
 *   npx playwright install chromium
 *   npm run dev                                  # terminal 1
 *   npx playwright test                          # terminal 2
 *
 * Signup test specifically needs:
 *   - Supabase project reachable from the dev server
 *   - SUPABASE_SERVICE_ROLE_KEY present in .env.local
 *   - Migrations 00052/00053/00054 applied
 *   - Resend SMTP configured (or Supabase built-in email enabled) so
 *     verification emails actually go out; test does not require the
 *     email to be received — it stops at the "verify email" banner.
 */
export default defineConfig({
    testDir: '.',
    testMatch: [
        'e2e/**/*.spec.ts',
        'tests/onboarding/**/*.test.ts',
        // BRIEF-59 — scenario tests for password reset (s8) + multi-org accept (s7).
        'tests/scenarios/**/*.test.ts',
    ],
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : 1,
    reporter: 'list',
    use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
})
