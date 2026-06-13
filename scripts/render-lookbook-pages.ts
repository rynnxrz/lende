/**
 * render-lookbook-pages.ts
 *
 * Renders every page of a PDF lookbook to a JPG and uploads it to
 * Supabase Storage under `lookbooks/lookbook-pages/<lookbook_id>/p-NNN.jpg`.
 *
 * Used by the admin items page to show a tiny per-item bbox crop next to
 * the inventory photo, so the admin can verify "this PDF really shows this
 * item" at a glance.
 *
 * Usage:
 *   pnpm tsx scripts/render-lookbook-pages.ts <lookbook-id>
 *   pnpm tsx scripts/render-lookbook-pages.ts --all
 *
 * Idempotent: re-running overwrites the JPGs.
 *
 * Requires `pdftoppm` (Poppler) on PATH:
 *   brew install poppler
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..')
const ENV_PATH = join(REPO_ROOT, '.env.local')
const BUCKET = 'lookbooks'
const PAGE_PREFIX = 'lookbook-pages'
const RENDER_DPI = 150
const JPEG_QUALITY = 80

function loadEnv(): Record<string, string> {
    if (!existsSync(ENV_PATH)) return {}
    const out: Record<string, string> = {}
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    return out
}

function pad(n: number): string {
    return String(n).padStart(3, '0')
}

type LookbookRow = {
    id: string
    slug: string
    pdf_url: string | null
    page_count: number | null
    organization_id: string
}

async function downloadPdf(sb: SupabaseClient, pdfPath: string): Promise<Buffer> {
    const { data, error } = await sb.storage.from(BUCKET).download(pdfPath)
    if (error || !data) throw new Error(`download ${pdfPath} failed: ${error?.message}`)
    const ab = await data.arrayBuffer()
    return Buffer.from(ab)
}

function runPdftoppm(pdfPath: string, outPrefix: string): Promise<void> {
    return new Promise((resolvePromise, rejectPromise) => {
        const args = [
            '-jpeg',
            '-jpegopt', `quality=${JPEG_QUALITY},progressive=y`,
            '-r', String(RENDER_DPI),
            pdfPath,
            outPrefix,
        ]
        const child = spawn('pdftoppm', args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', chunk => { stderr += chunk.toString() })
        child.on('error', rejectPromise)
        child.on('exit', code => {
            if (code === 0) resolvePromise()
            else rejectPromise(new Error(`pdftoppm exited with code ${code}: ${stderr.trim()}`))
        })
    })
}

async function renderLookbook(sb: SupabaseClient, lookbook: LookbookRow): Promise<void> {
    if (!lookbook.pdf_url) {
        console.warn(`[render] ${lookbook.slug}: no pdf_url, skipping`)
        return
    }

    const workDir = mkdtempSync(join(tmpdir(), 'lookbook-render-'))
    try {
        console.log(`[render] ${lookbook.slug}: downloading PDF…`)
        const pdfBytes = await downloadPdf(sb, lookbook.pdf_url)
        const pdfPath = join(workDir, 'input.pdf')
        writeFileSync(pdfPath, pdfBytes)

        const outPrefix = join(workDir, 'page')
        console.log(`[render] ${lookbook.slug}: rasterising via pdftoppm at ${RENDER_DPI} DPI…`)
        await runPdftoppm(pdfPath, outPrefix)

        const files = readdirSync(workDir)
            .filter(f => /^page-\d+\.jpg$/.test(f))
            .sort()
        if (files.length === 0) throw new Error('pdftoppm produced no output files')
        console.log(`[render] ${lookbook.slug}: rendered ${files.length} page(s), uploading…`)

        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const pageNum = i + 1
            const buf = readFileSync(join(workDir, file))
            const objectPath = `${PAGE_PREFIX}/${lookbook.id}/p-${pad(pageNum)}.jpg`
            const { error: upErr } = await sb.storage
                .from(BUCKET)
                .upload(objectPath, buf, { contentType: 'image/jpeg', upsert: true })
            if (upErr) throw new Error(`upload ${objectPath} failed: ${upErr.message}`)
            process.stdout.write(`  p${pad(pageNum)} `)
        }
        console.log(`\n[render] ${lookbook.slug}: done.`)
    } finally {
        rmSync(workDir, { recursive: true, force: true })
    }
}

export async function renderLookbookById(sb: SupabaseClient, lookbookId: string): Promise<void> {
    const { data, error } = await sb
        .from('pdf_lookbooks')
        .select('id, slug, pdf_url, page_count, organization_id')
        .eq('id', lookbookId)
        .maybeSingle()
    if (error || !data) throw new Error(`lookbook ${lookbookId} not found: ${error?.message}`)
    await renderLookbook(sb, data as LookbookRow)
}

async function main(): Promise<void> {
    const arg = process.argv[2]
    if (!arg) {
        console.error('usage: render-lookbook-pages.ts <lookbook-id|--all>')
        process.exit(1)
    }

    const env = { ...loadEnv(), ...process.env }
    const url = env.NEXT_PUBLIC_SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
        process.exit(1)
    }
    const sb = createClient(url, key, { auth: { persistSession: false } })

    let lookbooks: LookbookRow[] = []
    if (arg === '--all') {
        const { data, error } = await sb
            .from('pdf_lookbooks')
            .select('id, slug, pdf_url, page_count, organization_id')
        if (error || !data) throw new Error(`list pdf_lookbooks failed: ${error?.message}`)
        lookbooks = data as LookbookRow[]
    } else {
        const { data, error } = await sb
            .from('pdf_lookbooks')
            .select('id, slug, pdf_url, page_count, organization_id')
            .eq('id', arg)
            .maybeSingle()
        if (error || !data) throw new Error(`lookbook ${arg} not found: ${error?.message}`)
        lookbooks = [data as LookbookRow]
    }

    console.log(`[render] processing ${lookbooks.length} lookbook(s)`)
    for (const lb of lookbooks) {
        try {
            await renderLookbook(sb, lb)
        } catch (err) {
            console.error(`[render] ${lb.slug} failed:`, err instanceof Error ? err.message : err)
        }
    }
    console.log('[render] all done.')
}

// Only run as a CLI if invoked directly (not when imported).
if (require.main === module) {
    main().catch(err => {
        console.error('[render] failed:', err instanceof Error ? err.message : err)
        process.exit(1)
    })
}
