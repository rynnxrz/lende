-- ============================================================
-- Migration 00000: Bootstrap stubs for dashboard-hand-created objects
-- 2026-05-07 added by BRIEF-47 §7.3 unblock (supabase start on clean local db)
-- ============================================================
-- Many migrations 00024+ reference is_admin() / is_org_admin() in CREATE POLICY
-- USING clauses, but these functions are only formally CREATE'd in 00052/00054/00058.
-- Prod works because those functions were hand-created in the Supabase dashboard
-- (see 00058 header comment). On a clean local db they don't exist yet → CREATE
-- POLICY fails with "function is_admin() does not exist".
--
-- This file pre-creates idempotent default-deny stubs so subsequent migrations
-- can reference them. Later migrations (00052 / 00054 / 00058) use CREATE OR
-- REPLACE to swap in the real bodies — return type stays BOOLEAN so REPLACE
-- is allowed. Default body is `SELECT false` to fail closed (RLS deny) in case
-- migration apply is interrupted before the real bodies install.
--
-- Safety on prod: prod schema_migrations does not yet have 00000. When this
-- file ships to prod via `supabase db push`, every CREATE OR REPLACE here is
-- harmless: prod functions are immediately overwritten by 00052/00054/00058
-- in the same migration run. End state identical.
-- ============================================================

-- 1. is_org_admin() — first formally CREATE'd in 00052_multi_tenant_orgs.sql
CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false
$$;

-- 2. is_admin() — first formally CREATE'd in 00054_jwt_org_claims.sql,
--    re-codified as org-scoped shim in 00058
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false
$$;

-- Note: reservation_status ENUM is NOT stubbed here because 00039 unconditionally
-- creates `reservation_status_new` then renames it to `reservation_status`.
-- 00006 has been patched separately (2026-05-07) to skip ALTER TYPE if ENUM
-- doesn't exist, which is the clean-local-db path.

-- Grant execute to authenticated role (matches 00058 final grants)
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION is_org_admin() TO authenticated, anon, service_role;
