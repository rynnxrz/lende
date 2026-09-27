-- Run with: supabase db query --linked --file supabase/tests/collections-admin-rls.sql
-- Every fixture and write is rolled back, including on assertion failure.
BEGIN;
CREATE TEMP TABLE collection_rls_results (scenario text, passed boolean);
GRANT INSERT ON collection_rls_results TO authenticated, anon;

DO $test$
DECLARE
    org_a uuid := gen_random_uuid();
    org_b uuid := gen_random_uuid();
    owner_id uuid := gen_random_uuid();
    admin_id uuid := gen_random_uuid();
    staff_id uuid := gen_random_uuid();
    outsider_id uuid := gen_random_uuid();
    scenario record;
    inserted_id uuid;
    allowed boolean;
BEGIN
    INSERT INTO public.organizations (id, slug, name) VALUES
        (org_a, 'rls-' || left(replace(org_a::text, '-', ''), 24), 'Rolled-back RLS fixture A'),
        (org_b, 'rls-' || left(replace(org_b::text, '-', ''), 24), 'Rolled-back RLS fixture B');
    INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data) VALUES
        (owner_id, owner_id || '@rls-test.invalid', 'authenticated', 'authenticated', '{}'),
        (admin_id, admin_id || '@rls-test.invalid', 'authenticated', 'authenticated', '{}'),
        (staff_id, staff_id || '@rls-test.invalid', 'authenticated', 'authenticated', '{}'),
        (outsider_id, outsider_id || '@rls-test.invalid', 'authenticated', 'authenticated', '{}');
    INSERT INTO public.organization_members (organization_id, user_id, role, accepted_at) VALUES
        (org_a, owner_id, 'owner', now()),
        (org_a, admin_id, 'admin', now()),
        (org_a, staff_id, 'staff', now());

    FOR scenario IN SELECT * FROM (VALUES
        ('owner', owner_id, org_a, org_a, true, true),
        ('admin', admin_id, org_a, org_a, true, true),
        ('staff with stale owner claim', staff_id, org_a, org_a, false, false),
        ('nonmember with owner claim', outsider_id, org_a, org_a, false, false),
        ('cross-workspace write', owner_id, org_a, org_b, true, false),
        ('missing workspace claim', owner_id, NULL::uuid, org_a, false, false),
        ('anonymous', NULL::uuid, org_a, org_a, false, false)
    ) AS cases(label, user_id, token_org, target_org, expected_admin, expected_write)
    LOOP
        PERFORM set_config('request.jwt.claims', jsonb_build_object(
            'sub', scenario.user_id, 'role', CASE WHEN scenario.user_id IS NULL THEN 'anon' ELSE 'authenticated' END,
            'app_metadata', jsonb_build_object('current_org_id', scenario.token_org, 'current_org_role', 'owner')
        )::text, true);
        IF scenario.user_id IS NULL THEN
            SET LOCAL ROLE anon;
        ELSE
            SET LOCAL ROLE authenticated;
        END IF;
        IF public.is_org_admin() IS DISTINCT FROM scenario.expected_admin
           OR public.is_admin() IS DISTINCT FROM scenario.expected_admin THEN
            RAISE EXCEPTION 'Admin helper failed for %', scenario.label;
        END IF;
        allowed := true;
        BEGIN
            INSERT INTO public.collections (name, slug, organization_id)
            VALUES ('RLS test ' || gen_random_uuid(), 'rls-test-' || gen_random_uuid(), scenario.target_org)
            RETURNING id INTO inserted_id;
        EXCEPTION WHEN insufficient_privilege THEN
            allowed := false;
        END;
        IF allowed IS DISTINCT FROM scenario.expected_write THEN
            RAISE EXCEPTION 'Collection write failed for %: expected %, got %', scenario.label, scenario.expected_write, allowed;
        END IF;
        INSERT INTO collection_rls_results VALUES (scenario.label, true);
        RESET ROLE;
    END LOOP;
END;
$test$;
SELECT * FROM collection_rls_results;
ROLLBACK;
