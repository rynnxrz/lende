-- Migration 00070: Rename reservations.customer_id → renter_id to reconcile
-- long-standing drift between local DB (renter_id) and prod (customer_id).
--
-- Background: at some point during dec 2025 the local supabase DB had its
-- `reservations.customer_id` column manually renamed to `renter_id` via the
-- Studio SQL editor, but the change was never written as a migration.
-- All app code and the committed TypeScript types use `renter_id`, but
-- prod still has `customer_id`. Every reservation query / insert that
-- references `renter_id` in prod errors with PG `42703` (column does not
-- exist) or PGRST200 (no such relationship).
--
-- This migration brings prod in line with the codebase's mental model.
--
-- Idempotent: the DO block is a no-op when `renter_id` already exists
-- (i.e. local).

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reservations'
          AND column_name = 'customer_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reservations'
          AND column_name = 'renter_id'
    ) THEN
        -- Drop the policy that references customer_id by name (from 00053:223-225).
        -- Recreated below with the renamed column.
        DROP POLICY IF EXISTS "Customer view own reservations" ON reservations;

        -- Rename column
        ALTER TABLE reservations RENAME COLUMN customer_id TO renter_id;

        -- Rename FK constraint so PostgREST embed hints like
        -- `profiles!reservations_renter_id_fkey(...)` resolve correctly
        ALTER TABLE reservations
            RENAME CONSTRAINT reservations_customer_id_fkey
            TO reservations_renter_id_fkey;

        -- Recreate the RLS policy with the new column name. Semantically
        -- identical: allow a logged-in user to SELECT reservations whose
        -- renter is them.
        CREATE POLICY "Customer view own reservations" ON reservations
            FOR SELECT USING (renter_id = auth.uid());
    END IF;
END $$;

-- Force PostgREST to reload its schema cache so the renamed column and
-- FK constraint become available to API queries without a restart.
NOTIFY pgrst, 'reload schema';
