-- ============================================================
-- Migration 00061: seed_org_from_template RPC
-- BRIEF-48 step 4 — copy IVYJSTUDIO catalog as starter sample data into a new org
-- ============================================================
-- Strategy:
--   Copy catalog-only tables (items + categories + collections) — not reservations /
--   invoices / customer_service_* because those carry auth.users / customer FKs that
--   would require fake user rows and break referential integrity. Catalog is enough
--   for step 4 ("Add first listing → Use sample data") and unblocks step 5 ("Share
--   with team") which only needs *any* listing visible.
--
--   Explicit column lists (no SELECT *) per BRIEF-48 Risk #3 — protects against
--   schema drift between the v1 (single-tenant) IVYJSTUDIO seed and any column
--   added in a future migration that would break implicit copies.
--
--   LIMIT 20 items / all categories / all collections — the brief allows 20 products.
--
--   Source org slug = 'ivyjstudio' (00053 §Step 1 created this row to anchor legacy
--   data; it has the v2 196-listing inventory).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION seed_org_from_template(p_target_org_id UUID)
RETURNS TABLE (
    items_inserted INT,
    categories_inserted INT,
    collections_inserted INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_source_org_id UUID;
    v_is_admin BOOLEAN;
    v_items_n INT := 0;
    v_categories_n INT := 0;
    v_collections_n INT := 0;
    -- Mapping old.id -> new.id for FK rewires (categories/collections referenced by items)
    v_cat_map JSONB := '{}'::jsonb;
    v_col_map JSONB := '{}'::jsonb;
BEGIN
    -- ── Authorization ────────────────────────────────────────
    -- Caller must be an admin/owner of the target org. Block silent cross-org seeding.
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM organization_members
         WHERE organization_id = p_target_org_id
           AND user_id = v_caller
           AND role IN ('owner', 'admin')
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only org admin/owner can seed sample data' USING ERRCODE = '42501';
    END IF;

    -- ── Locate source org (IVYJSTUDIO) ───────────────────────
    SELECT id INTO v_source_org_id FROM organizations WHERE slug = 'ivyjstudio';
    IF v_source_org_id IS NULL THEN
        RAISE EXCEPTION 'Template org (ivyjstudio) not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_source_org_id = p_target_org_id THEN
        RAISE EXCEPTION 'Cannot seed an org from itself' USING ERRCODE = '22023';
    END IF;

    -- ── Idempotence guard: skip if target already has items ──
    IF EXISTS (SELECT 1 FROM items WHERE organization_id = p_target_org_id LIMIT 1) THEN
        RAISE NOTICE 'Target org % already has items; skipping seed', p_target_org_id;
        RETURN QUERY SELECT 0, 0, 0;
        RETURN;
    END IF;

    -- ── 1. categories ────────────────────────────────────────
    -- Note: categories.name + .slug are UNIQUE globally (00018). To copy them
    -- safely into a new org we suffix slug with '-<short_org>' to avoid collision.
    -- Display name we keep verbatim (UNIQUE constraint will need to be relaxed
    -- in a future migration to per-org once second org goes live; for now we
    -- prepend the target org's short slug to dodge collision).
    WITH src AS (
        SELECT id AS old_id, name, slug
          FROM categories
         WHERE organization_id = v_source_org_id
    ),
    inserted AS (
        INSERT INTO categories (organization_id, name, slug, created_at)
        SELECT
            p_target_org_id,
            src.name || ' (sample)',
            src.slug || '-' || SUBSTRING(p_target_org_id::TEXT FROM 1 FOR 8),
            NOW()
          FROM src
        RETURNING id, slug
    )
    SELECT
        COUNT(*)::INT,
        jsonb_object_agg(src.old_id::TEXT, ins.id::TEXT)
      INTO v_categories_n, v_cat_map
      FROM (
        SELECT id AS old_id, slug || '-' || SUBSTRING(p_target_org_id::TEXT FROM 1 FOR 8) AS new_slug
          FROM categories WHERE organization_id = v_source_org_id
      ) src
      JOIN inserted ins ON ins.slug = src.new_slug;

    -- ── 2. collections ───────────────────────────────────────
    WITH src AS (
        SELECT id AS old_id, name, slug
          FROM collections
         WHERE organization_id = v_source_org_id
    ),
    inserted AS (
        INSERT INTO collections (organization_id, name, slug, created_at)
        SELECT
            p_target_org_id,
            src.name || ' (sample)',
            src.slug || '-' || SUBSTRING(p_target_org_id::TEXT FROM 1 FOR 8),
            NOW()
          FROM src
        RETURNING id, slug
    )
    SELECT
        COUNT(*)::INT,
        jsonb_object_agg(src.old_id::TEXT, ins.id::TEXT)
      INTO v_collections_n, v_col_map
      FROM (
        SELECT id AS old_id, slug || '-' || SUBSTRING(p_target_org_id::TEXT FROM 1 FOR 8) AS new_slug
          FROM collections WHERE organization_id = v_source_org_id
      ) src
      JOIN inserted ins ON ins.slug = src.new_slug;

    -- ── 3. items (LIMIT 20) ──────────────────────────────────
    -- Explicit column list: id (auto), sku, name, description, category, specs,
    -- rental_price, replacement_cost, images, status, created_at (auto), updated_at (auto),
    -- category_id, collection_id, organization_id.
    --
    -- sku must remain UNIQUE globally (00001) so suffix with target org short id.
    -- timestamps reset to NOW() — no fake legacy backdates.
    WITH inserted_items AS (
        INSERT INTO items (
            organization_id,
            sku,
            name,
            description,
            category,
            specs,
            rental_price,
            replacement_cost,
            images,
            status,
            category_id,
            collection_id,
            created_at,
            updated_at
        )
        SELECT
            p_target_org_id,
            src.sku || '-S' || SUBSTRING(p_target_org_id::TEXT FROM 1 FOR 6),
            src.name,
            src.description,
            src.category,
            src.specs,
            src.rental_price,
            src.replacement_cost,
            src.images,
            'active',
            (v_cat_map ->> src.category_id::TEXT)::UUID,
            (v_col_map ->> src.collection_id::TEXT)::UUID,
            NOW(),
            NOW()
          FROM items src
         WHERE src.organization_id = v_source_org_id
           AND src.status = 'active'
         ORDER BY src.created_at DESC
         LIMIT 20
        RETURNING id
    )
    SELECT COUNT(*)::INT INTO v_items_n FROM inserted_items;

    RETURN QUERY SELECT v_items_n, v_categories_n, v_collections_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION seed_org_from_template(UUID) FROM public;
GRANT  EXECUTE ON FUNCTION seed_org_from_template(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Verification SQL (manual, run after `supabase db push`):
-- ============================================================
-- -- 1. RPC visible
-- SELECT routine_name, security_type
--   FROM information_schema.routines
--  WHERE routine_name = 'seed_org_from_template';
--
-- -- 2. Smoke test: create a fresh org + member, then seed
-- WITH new_org AS (
--   INSERT INTO organizations (slug, name, plan)
--   VALUES ('test-seed-' || substring(gen_random_uuid()::text, 1, 8), 'Test Seed', 'trial')
--   RETURNING id
-- )
-- INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
-- SELECT new_org.id, auth.uid(), 'owner', NOW() FROM new_org RETURNING organization_id;
--
-- SELECT * FROM seed_org_from_template('<that-org-id>');
-- SELECT COUNT(*) FROM items WHERE organization_id = '<that-org-id>';  -- expect 20
--
-- -- 3. Cross-tenant isolation: from another org's session, verify
-- --    SELECT FROM items WHERE organization_id = '<test-org>' returns 0.
-- ============================================================
