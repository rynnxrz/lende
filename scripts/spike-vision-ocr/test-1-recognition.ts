/**
 * BRIEF-53 v2 — DEPRECATED.
 *
 * v1 of BRIEF-53 planned to call `claude-sonnet-4-5-20250929` via the Anthropic
 * SDK from the lende backend so the OCR could be a user-facing feature. v2
 * (Rongze 2026-05-08 15:30 CST) retracted that direction:
 *
 *   - No Anthropic API calls.
 *   - lende does NOT expose a "upload PDF → auto-recognize" feature.
 *   - Lookbook digitization is a Rongze paid service (D15 v3 Professional Services):
 *     Ivy hands the PDF to Rongze → Rongze runs recognition + matching inside a
 *     Cowork / Claude Code session using his Pro/Max subscription → output is
 *     SQL-INSERTed into lende DB → lende renders the hot-zones read-only.
 *
 * The 2026-05-08 spike's Test 1 outputs in `output/test-1-page-{N}.json` were
 * produced inside the Cowork session via the native `Read` tool on the page
 * JPEGs (no SDK, no API key). This file remains only as a record of the v1
 * plan; do not run it.
 *
 * If you need to re-run Test 1, open the JPEGs directly in a Cowork / Claude
 * Code session and ask the session to apply PROMPT_T1 (see brief BRIEF-53 v2
 * Step 3) to each.
 */
export {};
