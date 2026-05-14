/**
 * Brand identity constants — single source of truth for tenant-facing brand strings.
 *
 * Multi-tenancy roadmap (BRIEF-03 path-based routing):
 *   These constants will be replaced by per-org context (organizations.name etc.)
 *   loaded via JWT claims + RLS. For now, they read from env vars to keep the
 *   legacy single-tenant deployment branding configurable without hardcoded
 *   strings in src/.
 *
 * Default fallback values use 'lende' (D1 product name, locked 2026-05-02) so
 * a fresh deployment with no env config still renders clean placeholder copy.
 *
 * Operator note:
 *   For the legacy single-tenant deployment, set NEXT_PUBLIC_BRAND_* env vars
 *   in Vercel / .env.local to render the studio's brand. See .env.example
 *   for the full list of variables.
 *
 * BRIEF-07 — brand-name string scrub（2026-05-02）
 */

// Display name shown in headers, page titles, marketing copy.
export const BRAND_NAME =
  process.env.NEXT_PUBLIC_BRAND_NAME ?? 'lende'

// All-caps variant used in legal documents (loan form heading etc.).
export const BRAND_NAME_UPPER =
  process.env.NEXT_PUBLIC_BRAND_NAME_UPPER ?? 'LENDE'

// Instagram handle (no leading @). Used in loan form and marketing footers.
export const BRAND_INSTAGRAM =
  process.env.NEXT_PUBLIC_BRAND_INSTAGRAM ?? 'lende'

// Customer-facing contact email. Falls back to existing NEXT_PUBLIC_CONTACT_EMAIL
// for backward-compat with current .env files.
export const BRAND_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL ??
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ??
  'founder@shipbyx.com'

// Domain used by catalog import to fetch product photos via the studio's website
// search endpoint (Shopify search/suggest.json or compatible). Optional — when
// unset, website-match step is skipped.
export const BRAND_PRODUCT_LOOKUP_DOMAIN =
  process.env.NEXT_PUBLIC_BRAND_PRODUCT_LOOKUP_DOMAIN ?? null

// Customer-service AI persona name (the on-screen "concierge" character).
export const BRAND_CONCIERGE_NAME =
  process.env.NEXT_PUBLIC_BRAND_CONCIERGE_NAME ?? 'the studio assistant'

// Studio postal address lines for legal documents (loan form footer etc.).
// Pipe-delimited string; consumers split on '|' to render line-by-line.
const _addressEnv =
  process.env.NEXT_PUBLIC_BRAND_ADDRESS_LINES ?? ''
export const BRAND_ADDRESS_LINES: readonly string[] =
  _addressEnv.length > 0 ? _addressEnv.split('|') : []

// Studio phone number for legal documents.
export const BRAND_PHONE =
  process.env.NEXT_PUBLIC_BRAND_PHONE ?? ''
