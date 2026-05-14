/**
 * BRIEF-54 v3 — capture desktop 1280 + mobile 390 screenshots of the
 * customer lookbook page for the [DONE] DoD.
 *
 * Usage:
 *   npx tsx scripts/lookbook-screenshot.ts \
 *       http://localhost:3000/ivyjstudio/lookbook/2026SS \
 *       tracker/brief-54-prod-screenshots
 */

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

async function main(): Promise<void> {
    const url = process.argv[2]
    const outDirArg = process.argv[3] ?? 'tracker/brief-54-prod-screenshots'
    if (!url) {
        console.error('usage: lookbook-screenshot.ts <url> [out-dir]')
        process.exit(1)
    }
    const outDir = resolve(outDirArg)
    mkdirSync(outDir, { recursive: true })

    const browser = await chromium.launch()
    try {
        for (const variant of [
            { name: 'desktop-1280', width: 1280, height: 900 },
            { name: 'mobile-390', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
        ]) {
            const ctx = await browser.newContext({
                viewport: { width: variant.width, height: variant.height },
                deviceScaleFactor: variant.deviceScaleFactor,
                isMobile: variant.isMobile,
            })
            const page = await ctx.newPage()
            page.on('console', msg => {
                if (msg.type() === 'error') console.warn(`[browser:${variant.name}]`, msg.text())
            })
            await page.goto(url, { waitUntil: 'domcontentloaded' })
            // wait for at least one hot-zone to render so the screenshot
            // includes the layered overlay, not just a blank canvas.
            await page.waitForSelector('[data-testid^="lookbook-hotzone-"]', { timeout: 60_000 }).catch(() => {})
            await page.waitForTimeout(2_000)
            const out = `${outDir}/${variant.name}.png`
            await page.screenshot({ path: out, fullPage: true })
            console.log(`[screenshot] ${variant.name} → ${out}`)
            await ctx.close()
        }
    } finally {
        await browser.close()
    }
}

main().catch(err => {
    console.error('[screenshot] failed:', err.message ?? err)
    process.exit(1)
})
