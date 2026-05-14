/* eslint-disable no-console */
import { chromium } from 'playwright'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const htmlDir = resolve(process.cwd(), 'tracker/brief-52-email-html')
const screenshotDir = resolve(process.cwd(), 'tracker/brief-52-email-screenshots')

async function main() {
    const browser = await chromium.launch()
    const context = await browser.newContext({
        viewport: { width: 700, height: 900 },
        deviceScaleFactor: 2,
    })
    const page = await context.newPage()

    const files = readdirSync(htmlDir)
        .filter((f) => f.endsWith('.html'))
        .sort()

    for (const file of files) {
        const html = readFileSync(resolve(htmlDir, file), 'utf-8')
        const day = file.replace('.html', '')
        const outPath = resolve(screenshotDir, `${day}.png`)

        await page.setContent(html, { waitUntil: 'load' })
        await page.screenshot({
            path: outPath,
            fullPage: true,
        })
        console.log(`✓ ${day} → ${outPath}`)
    }

    await browser.close()
    console.log(`\nAll ${files.length} screenshots written.`)
}

main().catch((err) => {
    console.error('screenshot failed:', err)
    process.exit(1)
})
