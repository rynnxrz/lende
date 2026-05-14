-- ============================================================
-- Migration 00062: PDF Lookbook tables (BRIEF-54 v3)
-- Status: DRAFT (待评审 — 不要直接 supabase db push 上生产)
-- 依赖: 00052 (organizations + helpers) + 00053 (org-aware RLS pattern)
-- ============================================================
-- Adds two tables backing the PDF Lookbook double-import workflow:
--
--   1. pdf_lookbooks          (one row per published lookbook per org)
--   2. pdf_lookbook_items     (one row per item-on-page candidate;
--                              bbox NULLABLE — admin editor fills)
--
-- Multi-tenant RLS follows the 00053 pattern (`current_org_id()` +
-- `is_org_admin()`). Storefront SELECT path is opened to anon users
-- when a lookbook is published, so anonymous customers can render
-- the PDF + hot-zone overlay without auth.
--
-- match_status enum (v3 reframe — adds `auto_matched`):
--   needs_review        — vision推荐候选，bbox NULL，admin 待画框
--   auto_matched        — text-match.py 命中 SKU，bbox 自动填，
--                          客户已可见
--   confirmed           — admin editor 显式按 Confirm，锁定 inventory
--   rejected_no_match   — admin 标"无对应 SKU"，客户站不渲染 hot-zone
-- ============================================================

BEGIN;

-- ============================================================
-- 1. pdf_lookbooks: one row per lookbook per org
-- ============================================================
CREATE TABLE IF NOT EXISTS pdf_lookbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    pdf_url TEXT,
    page_count INT,
    published BOOLEAN NOT NULL DEFAULT false,
    editor_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (editor_status IN ('draft', 'reviewing', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT lookbook_slug_format
        CHECK (slug ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]*$' AND length(slug) BETWEEN 1 AND 64)
);

-- Composite unique: same org cannot have two lookbooks with same slug.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_lookbooks_org_slug
    ON pdf_lookbooks(organization_id, slug);

CREATE INDEX IF NOT EXISTS idx_pdf_lookbooks_published
    ON pdf_lookbooks(organization_id)
    WHERE published = true;

CREATE TRIGGER update_pdf_lookbooks_updated_at
    BEFORE UPDATE ON pdf_lookbooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. pdf_lookbook_items: one row per item-on-page candidate
-- ============================================================
CREATE TABLE IF NOT EXISTS pdf_lookbook_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lookbook_id UUID NOT NULL REFERENCES pdf_lookbooks(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
    page_number INT NOT NULL CHECK (page_number > 0),

    -- bbox: fraction-of-page (0..1). NULLABLE — ingest leaves bbox NULL
    -- for vision-only candidates; text-match.py fills bbox for
    -- auto_matched rows; admin editor fills bbox for needs_review rows.
    bbox_x NUMERIC(5,4) CHECK (bbox_x IS NULL OR (bbox_x >= 0 AND bbox_x <= 1)),
    bbox_y NUMERIC(5,4) CHECK (bbox_y IS NULL OR (bbox_y >= 0 AND bbox_y <= 1)),
    bbox_w NUMERIC(5,4) CHECK (bbox_w IS NULL OR (bbox_w > 0 AND bbox_w <= 1)),
    bbox_h NUMERIC(5,4) CHECK (bbox_h IS NULL OR (bbox_h > 0 AND bbox_h <= 1)),

    match_status TEXT NOT NULL DEFAULT 'needs_review'
        CHECK (match_status IN ('needs_review', 'auto_matched', 'confirmed', 'rejected_no_match')),
    match_confidence NUMERIC(3,2)
        CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1)),

    -- Audit log fields surfaced from the cowork-session vision run.
    -- Admin editor uses these as the "session 推荐参考" overlay.
    session_visual_description TEXT,
    session_visible_text TEXT,
    session_position_label TEXT,
    session_approx_size NUMERIC(3,2),

    -- Admin notes ("suggest new SKU", "matched but color uncertain", …)
    admin_notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_lookbook_items_lookbook_page
    ON pdf_lookbook_items(lookbook_id, page_number);

CREATE INDEX IF NOT EXISTS idx_pdf_lookbook_items_inventory
    ON pdf_lookbook_items(inventory_item_id)
    WHERE inventory_item_id IS NOT NULL;

CREATE TRIGGER update_pdf_lookbook_items_updated_at
    BEFORE UPDATE ON pdf_lookbook_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. RLS — pdf_lookbooks
-- ============================================================
-- Admin path: same `current_org_id()` + `is_org_admin()` pattern as
-- 00053. Storefront path: anon SELECT for any row that is published
-- (org-slug filtering is enforced by the route handler / URL).
-- ============================================================
ALTER TABLE pdf_lookbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published lookbooks" ON pdf_lookbooks
    FOR SELECT USING (
        published = true
        AND editor_status = 'published'
        AND organization_id IS NOT NULL
    );

CREATE POLICY "Org members read own lookbooks" ON pdf_lookbooks
    FOR SELECT USING (
        organization_id = current_org_id()
        AND is_org_member(organization_id)
    );

CREATE POLICY "Org admins manage lookbooks" ON pdf_lookbooks
    FOR ALL USING (
        organization_id = current_org_id()
        AND is_org_admin()
    )
    WITH CHECK (
        organization_id = current_org_id()
        AND is_org_admin()
    );

-- ============================================================
-- 4. RLS — pdf_lookbook_items (inherits org via lookbook_id JOIN)
-- ============================================================
ALTER TABLE pdf_lookbook_items ENABLE ROW LEVEL SECURITY;

-- Storefront: anon can see items whose parent lookbook is published
-- AND the item has a real bbox AND it's not rejected. needs_review
-- rows also need a bbox to be visible (otherwise hot-zone is undefined).
CREATE POLICY "Public can view published lookbook items" ON pdf_lookbook_items
    FOR SELECT USING (
        bbox_x IS NOT NULL
        AND match_status IN ('auto_matched', 'confirmed')
        AND EXISTS (
            SELECT 1 FROM pdf_lookbooks pl
            WHERE pl.id = pdf_lookbook_items.lookbook_id
              AND pl.published = true
              AND pl.editor_status = 'published'
        )
    );

-- Org members can SELECT every row for their lookbooks (including
-- needs_review without bbox — admin editor needs to see all candidates).
CREATE POLICY "Org members read own lookbook items" ON pdf_lookbook_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pdf_lookbooks pl
            WHERE pl.id = pdf_lookbook_items.lookbook_id
              AND pl.organization_id = current_org_id()
              AND is_org_member(pl.organization_id)
        )
    );

CREATE POLICY "Org admins manage own lookbook items" ON pdf_lookbook_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM pdf_lookbooks pl
            WHERE pl.id = pdf_lookbook_items.lookbook_id
              AND pl.organization_id = current_org_id()
              AND is_org_admin()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM pdf_lookbooks pl
            WHERE pl.id = pdf_lookbook_items.lookbook_id
              AND pl.organization_id = current_org_id()
              AND is_org_admin()
        )
    );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification SQL (run manually after `supabase db reset`):
-- ============================================================
-- SELECT * FROM pdf_lookbooks LIMIT 5;
-- SELECT * FROM pdf_lookbook_items LIMIT 5;
-- SELECT count(*) FROM pg_policies
--   WHERE tablename IN ('pdf_lookbooks', 'pdf_lookbook_items');
-- -- expect ≥ 6 (3 per table)
-- ============================================================
