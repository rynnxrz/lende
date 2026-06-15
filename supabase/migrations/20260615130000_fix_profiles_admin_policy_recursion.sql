-- ============================================================
-- Migration 20260615130000: fix infinite recursion in profiles RLS
-- ============================================================
-- Context:
--   00001's "Admins can view all profiles" policy on `profiles` does
--     EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
--   i.e. a profiles policy that queries profiles — Postgres has to apply
--   RLS to that inner SELECT too, which recurses forever and raises
--   42P17 "infinite recursion detected in policy for relation \"profiles\"".
--
--   This fires on ANY query that causes profiles RLS to be evaluated,
--   including PostgREST embeds like
--     reservations?select=*,profiles:profiles!reservations_renter_id_fkey(...)
--   which is exactly what `/[slug]/admin/reservations` does — so that
--   page's reservations query errors out entirely.
--
--   00053/00054 already moved "is admin" semantics to
--   organization_members via is_org_admin() (queries organization_members,
--   not profiles, so no recursion). Replace the recursive policy with
--   that.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Org admins can view all profiles" ON profiles
    FOR SELECT USING (is_org_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
