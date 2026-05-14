# BRIEF-53 v2 spike — Cowork/Claude Code session manual lookbook digitization

> 2026-05-08 spike. See `tracker/brief-53-spike-finding-2026-05-08.md` for the actual finding + 三档推荐.
>
> v1 → v2 (Rongze 2026-05-08 15:30 CST): no Anthropic API calls, no SDK in lende. Lookbook digitization is a Rongze paid service (per D15 v3) — runs entirely inside a Cowork or Claude Code session using the Pro/Max subscription's native vision. lende stores only the post-digitization mapping JSON / hot-zone overlay.

## What's in this directory

| File | Purpose |
|---|---|
| `pdf-to-image.ts` | Convert sample lookbook PDFs (in repo `docs/`) → JPEG @ 1024w into `output/`. Used as a one-off preprocessor before the session reads the JPEGs. |
| `test-3-bbox-render.ts` | Render half-transparent bbox overlays from the session's per-page JSON (`output/test-1-page-*.json`) via 9-grid + approx_size → 3 PNGs in `tracker/brief-53-spike-finding/`. |
| `pull-inventory.ts` | (optional) Reads remote Supabase via `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, dumps IVYJSTUDIO `items` to `inventory-snapshot.json`. The 2026-05-08 spike used `psql` directly — this script is provided as a portable alternative. |
| `test-1-recognition.ts` | **DEPRECATED v1 stub** — see header comment. Do not run. |
| `test-2-matching.ts` | **DEPRECATED v1 stub** — see header comment. Do not run. |
| `output/` | (gitignored) Intermediate JPEGs + the session's per-page recognition / matching JSONs. |
| `inventory-snapshot.json` | (gitignored) IVYJSTUDIO inventory dump used as Test 2 ground truth. |

## How the v2 spike was actually run (2026-05-08)

1. **Step 2 — PDF → JPEG** (this script): `pdftoppm` selected 5 pages from `docs/2026SS.pdf` (1, 2, 4, 12, 18 — covering single-product cover + collage intro + 3 SKU collages) + 1 page from `docs/Ivy J Studio Pricing List.pdf` (table-style control). Six JPEGs written to `output/page-{1..6}.jpg` at 1024w.
2. **Step 3 — Test 1 商品识别**: the Cowork session opened each JPEG via the native `Read` tool, applied PROMPT_T1 (in BRIEF-53 v2 Step 3), wrote `output/test-1-page-{N}.json`. No SDK, no API call.
3. **Step 4 — Test 2 inventory matching**: same session read `output/test-1-page-*.json` + `inventory-snapshot.json` (pulled via `psql`), reasoned against PROMPT_T2, wrote `output/test-2-results.json`.
4. **Step 5 — Test 3 bbox overlay**: `test-3-bbox-render.ts` consumed the Test 1 JSON + page JPEGs, composited red overlays via `sharp`, wrote 3 PNGs to `tracker/brief-53-spike-finding/`.
5. **Mapping draft**: the session aggregated Test 1 + Test 2 outputs into `tracker/brief-53-spike-finding/lookbook-mapping-draft.json` — a per-page schema sketch ready for SQL INSERT once BRIEF-39 §3 lands.

## Rerunning the spike on a new lookbook

A future Cowork session can repeat the workflow on a different PDF without code changes:
- Drop the new PDF into `docs/` (or `samples/` if preferred — the `pdf-to-image.ts` script accepts either path; just edit the `PAGE_PLAN` constant)
- `npx tsx scripts/spike-vision-ocr/pdf-to-image.ts`
- Open the produced JPEGs in the session, apply PROMPT_T1 / PROMPT_T2 (copy from BRIEF-53 v2 Step 3-4), save the JSONs
- `npx tsx scripts/spike-vision-ocr/test-3-bbox-render.ts`
- Update `lookbook-mapping-draft.json` with the new page entries

This is the workflow Rongze will charge for under D15 v3 Professional Services.
