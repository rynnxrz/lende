/**
 * One-off: migrate item image files from the legacy Supabase project
 * (bfizqdyngujjdmaaoggg) into the current project (zigyiqqboiadinelfzxw),
 * then rewrite the stored URLs to the current host.
 *
 * Context: after the multi-tenant project migration the `items` image arrays
 * still pointed at the legacy project's public storage. This copies each file
 * into the current project's `rental_items` bucket (same object path) and
 * updates the DB row to the new host — per-row, only after a successful copy,
 * so a failed download never leaves a dangling URL.
 *
 * Idempotent: re-running re-uploads (upsert) and re-points only rows that still
 * reference the legacy host. Column-agnostic: works whether the column is named
 * `images` (pre-rename) or `image_paths` (post-rename).
 *
 * Usage:
 *   HTTPS_PROXY=$HTTPS_PROXY npx tsx scripts/migrate-item-images-to-current-project.ts [--dry-run]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const ENV_PATH = join(REPO_ROOT, '.env.local');
const BUCKET = 'rental_items';
const LEGACY_HOST = 'bfizqdyngujjdmaaoggg.supabase.co';
const PUBLIC_SEGMENT = `/storage/v1/object/public/${BUCKET}/`;
const DRY_RUN = process.argv.includes('--dry-run');

function loadEnv(): Record<string, string> {
    if (!existsSync(ENV_PATH)) return {};
    const out: Record<string, string> = {};
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
}

async function ensureBucket(sb: SupabaseClient): Promise<void> {
    const { data: existing, error } = await sb.storage.listBuckets();
    if (error) throw new Error(`listBuckets failed: ${error.message}`);
    if (existing?.some((b) => b.name === BUCKET)) return;
    if (DRY_RUN) {
        console.log(`[dry-run] would create public bucket "${BUCKET}"`);
        return;
    }
    const { error: createErr } = await sb.storage.createBucket(BUCKET, { public: true });
    if (createErr && !/already exists/i.test(createErr.message)) {
        throw new Error(`createBucket(${BUCKET}) failed: ${createErr.message}`);
    }
    console.log(`Created public bucket "${BUCKET}".`);
}

/** Object path within the bucket, or null if the URL isn't a legacy bucket URL. */
function legacyObjectPath(url: string): string | null {
    if (!url.includes(LEGACY_HOST)) return null;
    const idx = url.indexOf(PUBLIC_SEGMENT);
    if (idx === -1) return null;
    return url.slice(idx + PUBLIC_SEGMENT.length);
}

async function copyOne(sb: SupabaseClient, currentHost: string, legacyUrl: string): Promise<string> {
    const objectPath = legacyObjectPath(legacyUrl);
    if (!objectPath) return legacyUrl; // not a legacy URL — leave as-is

    const res = await fetch(legacyUrl);
    if (!res.ok) throw new Error(`download ${res.status} for ${legacyUrl}`);
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const bytes = new Uint8Array(await res.arrayBuffer());

    if (!DRY_RUN) {
        const { error } = await sb.storage
            .from(BUCKET)
            .upload(objectPath, bytes, { contentType, upsert: true });
        if (error) throw new Error(`upload ${objectPath}: ${error.message}`);
    }
    return `https://${currentHost}${PUBLIC_SEGMENT}${objectPath}`;
}

async function main() {
    const env = loadEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
    const currentHost = new URL(url).host;
    if (currentHost === LEGACY_HOST) throw new Error('Current project IS the legacy project — aborting.');

    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await ensureBucket(sb);

    const { data: rows, error } = await sb.from('items').select('*');
    if (error) throw new Error(`fetch items: ${error.message}`);

    // Detect the image column name on whatever schema is live.
    const sample = rows?.[0] ?? {};
    const col = 'image_paths' in sample ? 'image_paths' : 'images' in sample ? 'images' : null;
    if (!col) throw new Error('Could not find image_paths/images column on items rows.');
    console.log(`Using image column "${col}". Scanning ${rows?.length ?? 0} items…`);

    let rowsUpdated = 0;
    let filesCopied = 0;
    let filesFailed = 0;

    for (const row of rows ?? []) {
        const arr: unknown = (row as Record<string, unknown>)[col];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        if (!arr.some((u) => typeof u === 'string' && u.includes(LEGACY_HOST))) continue;

        const next: string[] = [];
        let changed = false;
        for (const u of arr) {
            if (typeof u !== 'string') { next.push(u as unknown as string); continue; }
            try {
                const newUrl = await copyOne(sb, currentHost, u);
                if (newUrl !== u) { changed = true; filesCopied++; }
                next.push(newUrl);
            } catch (e) {
                filesFailed++;
                console.warn(`  ✗ item ${(row as { id?: string }).id}: ${(e as Error).message}`);
                next.push(u); // keep legacy URL on failure
            }
        }

        if (changed && !DRY_RUN) {
            const { error: upErr } = await sb.from('items').update({ [col]: next }).eq('id', (row as { id: string }).id);
            if (upErr) { console.warn(`  ✗ update item ${(row as { id?: string }).id}: ${upErr.message}`); continue; }
        }
        if (changed) rowsUpdated++;
    }

    console.log(
        `\n${DRY_RUN ? '[dry-run] ' : ''}Done. rows ${DRY_RUN ? 'to update' : 'updated'}: ${rowsUpdated}, ` +
        `files copied: ${filesCopied}, files failed: ${filesFailed}.`
    );
    if (filesFailed > 0) process.exitCode = 1;
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
