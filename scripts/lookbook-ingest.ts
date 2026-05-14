/**
 * BRIEF-54 v3 — Step 3: Lookbook ingest CLI.
 *
 * Combines two upstream sources into pdf_lookbook_items rows:
 *
 *   1. text-match JSON (from scripts/lookbook-text-match.py)
 *      → match_status='auto_matched' rows with full bbox.
 *
 *   2. vision-mapping JSON (from BRIEF-53 spike output)
 *      → match_status='needs_review' rows with bbox NULL,
 *        for any (page, inventory_item_id) not already covered by text-match.
 *
 * Idempotent: if (org_slug, lookbook_slug) already exists, deletes the
 * existing pdf_lookbooks row (CASCADE drops items) and re-inserts.
 *
 * Storage: ensures the `lookbooks` bucket exists (creates as private
 * with serviceRole-only bypass; storefront access goes through the
 * Next.js page handler, not direct anon storage URLs). Uploads the
 * PDF at `<org_id>/<lookbook-slug>.pdf`.
 *
 * Usage:
 *   npx tsx scripts/lookbook-ingest.ts \
 *       <org-slug> <lookbook-slug> <pdf-path> \
 *       <vision-mapping-json-path> [<text-match-json-path>]
 *
 * The 5th arg (text-match) is technically optional — if omitted, every
 * candidate is needs_review with bbox NULL (v2 behavior).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const ENV_PATH = join(REPO_ROOT, '.env.local');
const BUCKET = 'lookbooks';

function loadEnv(): Record<string, string> {
    if (!existsSync(ENV_PATH)) return {};
    const out: Record<string, string> = {};
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
}

type VisionMapping = {
    pages: Array<{
        page_number: number;
        items: Array<{
            inventory_item_id: string | null;
            inventory_sku?: string | null;
            match_confidence?: number | null;
            match_status?: string;
            session_visual_description?: string | null;
            session_visible_text?: string | null;
            bbox_position_label?: string | null;
            bbox?: { x?: number | null; y?: number | null; w?: number | null; h?: number | null };
            admin_notes?: string | null;
            no_match_reason?: string | null;
        }>;
    }>;
};

type TextMatch = {
    matches: Array<{
        page_number: number;
        inventory_item_id: string;
        sku: string;
        bbox_x: number;
        bbox_y: number;
        bbox_w: number;
        bbox_h: number;
        match_method: string;
        confidence: number;
    }>;
    stats: { total_pages?: number; pages_with_matches?: number; total_matches?: number };
};

async function ensureBucket(sb: SupabaseClient): Promise<void> {
    const { data: existing, error: listErr } = await sb.storage.listBuckets();
    if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);
    if (existing?.some((b) => b.name === BUCKET)) return;
    const { error } = await sb.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
        throw new Error(`createBucket(${BUCKET}) failed: ${error.message}`);
    }
}

async function uploadPdf(sb: SupabaseClient, orgId: string, lookbookSlug: string, pdfPath: string): Promise<string> {
    const objectPath = `${orgId}/${lookbookSlug}.pdf`;
    const buf = readFileSync(pdfPath);
    const { error } = await sb.storage
        .from(BUCKET)
        .upload(objectPath, buf, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error(`upload PDF failed: ${error.message}`);
    return objectPath;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.error('usage: lookbook-ingest.ts <org-slug> <lookbook-slug> <pdf-path> <vision-mapping-json> [<text-match-json>]');
        process.exit(1);
    }
    const [orgSlug, lookbookSlug, pdfArg, visionArg, textMatchArg] = args;

    const env = { ...loadEnv(), ...process.env };
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local');
        process.exit(1);
    }
    const sb = createClient(url, key, { auth: { persistSession: false } });

    const pdfPath = isAbsolute(pdfArg) ? pdfArg : join(REPO_ROOT, pdfArg);
    if (!existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

    const visionPath = isAbsolute(visionArg) ? visionArg : join(REPO_ROOT, visionArg);
    if (!existsSync(visionPath)) throw new Error(`vision mapping JSON not found: ${visionPath}`);
    const vision: VisionMapping = JSON.parse(readFileSync(visionPath, 'utf8'));

    let textMatch: TextMatch | null = null;
    if (textMatchArg) {
        const tmPath = isAbsolute(textMatchArg) ? textMatchArg : join(REPO_ROOT, textMatchArg);
        if (!existsSync(tmPath)) throw new Error(`text-match JSON not found: ${tmPath}`);
        textMatch = JSON.parse(readFileSync(tmPath, 'utf8'));
    }

    // 1. Resolve org
    const { data: org, error: orgErr } = await sb
        .from('organizations')
        .select('id, name')
        .eq('slug', orgSlug)
        .maybeSingle();
    if (orgErr || !org) throw new Error(`org not found: ${orgSlug} (${orgErr?.message})`);
    const orgId = org.id as string;
    console.log(`[ingest] org=${orgSlug} (${orgId})`);

    // 2. Storage: ensure bucket + upload PDF
    await ensureBucket(sb);
    const pdfObjectPath = await uploadPdf(sb, orgId, lookbookSlug, pdfPath);
    console.log(`[ingest] uploaded PDF → ${BUCKET}/${pdfObjectPath}`);

    // 3. Idempotent: delete existing lookbook (cascades to items)
    const { error: delErr } = await sb
        .from('pdf_lookbooks')
        .delete()
        .eq('organization_id', orgId)
        .eq('slug', lookbookSlug);
    if (delErr) throw new Error(`delete existing lookbook failed: ${delErr.message}`);

    // 4. Insert pdf_lookbooks row
    const pageCount = vision.pages.reduce((max, p) => Math.max(max, p.page_number), 0)
        || textMatch?.stats?.total_pages
        || 0;
    const { data: lookbook, error: lbErr } = await sb
        .from('pdf_lookbooks')
        .insert({
            organization_id: orgId,
            slug: lookbookSlug,
            title: lookbookSlug,
            pdf_url: pdfObjectPath,
            page_count: pageCount,
            published: false,
            editor_status: 'draft',
        })
        .select('id')
        .single();
    if (lbErr || !lookbook) throw new Error(`insert pdf_lookbooks failed: ${lbErr?.message}`);
    const lookbookId = lookbook.id as string;
    console.log(`[ingest] created pdf_lookbooks ${lookbookId}`);

    // SKU → id lookup, used to repair vision-mapping rows that have a
    // valid inventory_sku but a truncated/placeholder inventory_item_id
    // (BRIEF-53 spike output truncated some UUIDs for readability).
    const { data: invItems, error: invErr } = await sb
        .from('items')
        .select('id, sku')
        .eq('organization_id', orgId);
    if (invErr) throw new Error(`load items failed: ${invErr.message}`);
    const skuToId = new Map<string, string>();
    const validIds = new Set<string>();
    for (const it of invItems ?? []) {
        if (it.sku) skuToId.set(String(it.sku), String(it.id));
        if (it.id) validIds.add(String(it.id));
    }
    const isValidUuid = (s: string | null | undefined): s is string =>
        !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const resolveItemId = (id: string | null | undefined, sku: string | null | undefined): string | null => {
        if (isValidUuid(id) && validIds.has(id)) return id;
        if (sku && skuToId.has(sku)) return skuToId.get(sku) ?? null;
        return null;
    };

    // 5. Build candidate rows.
    // First, auto_matched from text-match (deduped by page_number+inventory_item_id).
    const autoMatched = new Map<string, ReturnType<typeof autoMatchRow>>();
    let autoSkipped = 0;
    for (const m of textMatch?.matches ?? []) {
        const resolvedId = resolveItemId(m.inventory_item_id, m.sku);
        if (!resolvedId) {
            autoSkipped += 1;
            continue;
        }
        const key = `${m.page_number}::${resolvedId}`;
        if (autoMatched.has(key)) continue;
        autoMatched.set(key, autoMatchRow(lookbookId, { ...m, inventory_item_id: resolvedId }));
    }

    // Then needs_review from vision — skip if (page, inventory_item_id) already auto_matched.
    const needsReview: Array<ReturnType<typeof needsReviewRow>> = [];
    let nullifiedFkCount = 0;
    for (const page of vision.pages) {
        for (const item of page.items) {
            // Repair truncated/missing inventory_item_id via SKU lookup.
            const resolvedId = resolveItemId(item.inventory_item_id ?? null, item.inventory_sku ?? null);
            if (item.inventory_item_id && !resolvedId) nullifiedFkCount += 1;
            const key = resolvedId
                ? `${page.page_number}::${resolvedId}`
                : `${page.page_number}::null::${needsReview.length}`;
            if (resolvedId && autoMatched.has(key)) continue;
            needsReview.push(needsReviewRow(lookbookId, page.page_number, { ...item, inventory_item_id: resolvedId }));
        }
    }
    if (autoSkipped) console.warn(`[ingest] WARN ${autoSkipped} auto_matched rows skipped (FK unresolvable)`);
    if (nullifiedFkCount) console.warn(`[ingest] WARN ${nullifiedFkCount} vision rows had unresolvable FK; inserted with inventory_item_id=NULL`);

    const allRows = [...autoMatched.values(), ...needsReview];
    if (allRows.length === 0) {
        console.warn('[ingest] no candidate rows to insert');
    } else {
        const { error: insErr } = await sb.from('pdf_lookbook_items').insert(allRows);
        if (insErr) throw new Error(`insert pdf_lookbook_items failed: ${insErr.message}`);
    }

    console.log(
        `[ingest] inserted ${autoMatched.size} auto_matched + ${needsReview.length} needs_review ` +
        `(total ${allRows.length}) for lookbook ${lookbookSlug}`,
    );
}

function autoMatchRow(lookbookId: string, m: TextMatch['matches'][number]) {
    return {
        lookbook_id: lookbookId,
        inventory_item_id: m.inventory_item_id,
        page_number: m.page_number,
        bbox_x: m.bbox_x,
        bbox_y: m.bbox_y,
        bbox_w: m.bbox_w,
        bbox_h: m.bbox_h,
        match_status: 'auto_matched' as const,
        match_confidence: m.confidence,
        session_visible_text: m.sku,
        admin_notes: `auto_matched via ${m.match_method}`,
    };
}

function needsReviewRow(
    lookbookId: string,
    pageNumber: number,
    item: VisionMapping['pages'][number]['items'][number],
) {
    const status =
        item.match_status === 'rejected_no_match'
            ? 'rejected_no_match'
            : 'needs_review';
    return {
        lookbook_id: lookbookId,
        inventory_item_id: item.inventory_item_id ?? null,
        page_number: pageNumber,
        bbox_x: null,
        bbox_y: null,
        bbox_w: null,
        bbox_h: null,
        match_status: status,
        match_confidence: item.match_confidence ?? null,
        session_visual_description: item.session_visual_description ?? null,
        session_visible_text: item.session_visible_text ?? null,
        session_position_label: item.bbox_position_label ?? null,
        admin_notes: item.admin_notes ?? item.no_match_reason ?? null,
    };
}

main().catch((err) => {
    console.error('[ingest] failed:', err.message ?? err);
    process.exit(1);
});
