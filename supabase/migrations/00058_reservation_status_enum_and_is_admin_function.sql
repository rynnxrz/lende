-- ============================================================
-- Migration 00058: Codify dashboard-created reservation_status enum + is_admin()
-- Depends: 00039 (enum creation), 00052 (is_org_admin), 00054 (is_admin shim)
-- ============================================================
-- These objects were hand-created in the new lende Supabase dashboard to
-- bootstrap the app. This migration ensures `supabase db reset` reproduces
-- them deterministically. Uses DO blocks for idempotency — safe to run on
-- databases where these already exist from earlier migrations.
-- ============================================================

-- 1. Ensure reservation_status enum has all required values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE reservation_status AS ENUM (
      'Pending Request',
      'Awaiting Confirmation',
      'Confirmed',
      'Active',
      'Completed',
      'Cancelled',
      'Rejected'
    );
  END IF;
END$$;

-- 2. Ensure is_admin() function exists as org-scoped shim
-- 00054 defines this, but if running on a fresh project where only
-- dashboard-created objects exist, this ensures the function is present.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN is_org_admin();
END$$;
