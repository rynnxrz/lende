-- ============================================================
-- Migration 20260615120000: align items image column + repair JWT hook
-- ============================================================
-- Context (post Supabase project migration bfiz… → zigy…):
--   The live `items` table column is `images` (from 00001), but the entire
--   codebase, generated types, and the get_available_items* RPCs /
--   available_items_today view all read `image_paths`. Result: the storefront
--   reads item.image_paths → undefined → placeholder; RelatedItems errors.
--   We rename the column to `image_paths` so the DB matches the rest of the
--   system (single source of truth), then patch the one function that still
--   wrote `images` (00061 seed) and harden the 00054 JWT hook whose EXCEPTION
--   path referenced columns that don't exist on system_errors.
-- ============================================================

BEGIN;

-- ── 1. Rename items.images → items.image_paths ──────────────
-- Guarded so the migration is idempotent / safe to re-run.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'items'
           AND column_name = 'images'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'items'
           AND column_name = 'image_paths'
    ) THEN
        ALTER TABLE items RENAME COLUMN images TO image_paths;
    END IF;
END $$;

-- ── 2. Patch seed_org_from_template (00061) — the only object that
--       wrote the old `images` column. Body unchanged except images→image_paths.
-- ============================================================
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
    v_cat_map JSONB := '{}'::jsonb;
    v_col_map JSONB := '{}'::jsonb;
BEGIN
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

    SELECT id INTO v_source_org_id FROM organizations WHERE slug = 'ivyjstudio';
    IF v_source_org_id IS NULL THEN
        RAISE EXCEPTION 'Template org (ivyjstudio) not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_source_org_id = p_target_org_id THEN
        RAISE EXCEPTION 'Cannot seed an org from itself' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (SELECT 1 FROM items WHERE organization_id = p_target_org_id LIMIT 1) THEN
        RAISE NOTICE 'Target org % already has items; skipping seed', p_target_org_id;
        RETURN QUERY SELECT 0, 0, 0;
        RETURN;
    END IF;

    -- categories
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

    -- collections
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

    -- items (LIMIT 20) — image_paths (renamed from images)
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
            image_paths,
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
            src.image_paths,
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

-- ── 3. Repair custom_access_token_hook (00054) ──────────────
-- Same org-claim logic, but the EXCEPTION path now writes the columns that
-- actually exist on system_errors (error_type, payload). The draft referenced
-- `error_payload` + `fingerprint`, which would turn any hook hiccup into a
-- token-issuance failure. Still fail-safe: returns the original event on error.
CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id      UUID;
    v_claims       jsonb;
    v_app_metadata jsonb;
    v_org_id       UUID;
    v_org_role     TEXT;
BEGIN
    v_user_id := (event ->> 'user_id')::UUID;
    v_claims  := event -> 'claims';

    IF v_user_id IS NULL OR v_claims IS NULL THEN
        RETURN event;
    END IF;

    -- 1. profiles.last_active_org_id (and still a member of it)
    SELECT om.organization_id, om.role
    INTO v_org_id, v_org_role
    FROM profiles p
    JOIN organization_members om
      ON om.user_id = p.id
     AND om.organization_id = p.last_active_org_id
    WHERE p.id = v_user_id
    LIMIT 1;

    -- 2. fallback: first accepted membership by join order
    IF v_org_id IS NULL THEN
        SELECT om.organization_id, om.role
        INTO v_org_id, v_org_role
        FROM organization_members om
        WHERE om.user_id = v_user_id
          AND om.accepted_at IS NOT NULL
        ORDER BY om.created_at ASC
        LIMIT 1;
    END IF;

    v_app_metadata := COALESCE(v_claims -> 'app_metadata', '{}'::jsonb);

    IF v_org_id IS NOT NULL THEN
        v_app_metadata := v_app_metadata
            || jsonb_build_object(
                'current_org_id', v_org_id::text,
                'current_org_role', v_org_role
            );
    ELSE
        v_app_metadata := v_app_metadata
            || jsonb_build_object('current_org_id', NULL);
    END IF;

    v_claims := v_claims || jsonb_build_object('app_metadata', v_app_metadata);

    RETURN jsonb_build_object('claims', v_claims);

EXCEPTION WHEN OTHERS THEN
    -- fail-safe: log to the real system_errors shape, never block login
    INSERT INTO system_errors (error_type, payload)
    VALUES (
        'jwt_hook_failure',
        jsonb_build_object(
            'user_id', v_user_id,
            'sqlstate', SQLSTATE,
            'sqlerrm', SQLERRM
        )
    );
    RETURN event;
END;
$$;

REVOKE EXECUTE ON FUNCTION custom_access_token_hook(jsonb) FROM authenticated, anon, public;
GRANT  EXECUTE ON FUNCTION custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT  USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT  SELECT ON profiles, organization_members TO supabase_auth_admin;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Manual steps after applying this migration:
--   1. Dashboard → Authentication → Hooks → Custom Access Token:
--        enable, type=Postgres, schema=public, fn=custom_access_token_hook
--   2. Verify the hook resolves an org for the user:
--        SELECT custom_access_token_hook(jsonb_build_object(
--          'user_id', (SELECT id FROM auth.users WHERE email='<you>'),
--          'claims', jsonb_build_object('sub','x','email','<you>',
--            'app_metadata', jsonb_build_object('provider','email'))));
--      → returned.claims.app_metadata.current_org_id must be a UUID.
-- ============================================================
