-- Bootstrap migration 00000 was applied after the real helpers already existed,
-- replacing both admin checks with SELECT false. Restore membership-based
-- authorization; do not trust a role claim that can outlive a membership change.
-- This existing RLS helper intentionally runs as definer to avoid recursive
-- membership policies. It accepts no user/org arguments and exposes only the
-- caller's permission boolean (false for anon), with a fixed search path.
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = public.current_org_id()
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT public.is_org_admin();
$$;
