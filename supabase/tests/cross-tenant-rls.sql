-- BRIEF-47 step 4 — Cross-tenant RLS pgTAP test.
--
-- Verifies that a user belonging to org A cannot read or write data that
-- belongs to org B for every multi-tenant business table. Reproduces the
-- "F3 RLS context drift" risk from BRIEF-47 by simulating a real authenticated
-- request: SET ROLE authenticated + SET request.jwt.claims = ... org A user.
--
-- How to run:
--   1. supabase start (requires docker)                  — local stack
--   2. supabase test db --file supabase/tests/cross-tenant-rls.sql
--
--   OR, against any postgres with pgTAP loaded:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cross-tenant-rls.sql
--
-- Plan: 18 assertions (14 base + 4 BRIEF-54 v3 pdf_lookbooks / pdf_lookbook_items).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(18);

-- ============================================================
-- 1. Fixture: two orgs, one user per org
-- ============================================================
DO $$
DECLARE
    v_org_a UUID;
    v_org_b UUID;
    v_user_a UUID := gen_random_uuid();
    v_user_b UUID := gen_random_uuid();
BEGIN
    -- Two organizations
    INSERT INTO organizations (id, slug, name, plan)
    VALUES (gen_random_uuid(), 'pgtap-rls-a', 'pgTAP RLS A', 'trial')
    RETURNING id INTO v_org_a;

    INSERT INTO organizations (id, slug, name, plan)
    VALUES (gen_random_uuid(), 'pgtap-rls-b', 'pgTAP RLS B', 'trial')
    RETURNING id INTO v_org_b;

    -- auth.users rows so FK constraints on organization_members hold.
    -- supabase test db ships an empty auth schema; insert_user is provided
    -- by tests.create_supabase_user OR direct INSERT (depending on toolkit).
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
    VALUES
        (v_user_a, 'a@pgtap.test', '', now(), now(), now(), 'authenticated', 'authenticated'),
        (v_user_b, 'b@pgtap.test', '', now(), now(), now(), 'authenticated', 'authenticated')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
    VALUES
        (v_org_a, v_user_a, 'owner', now()),
        (v_org_b, v_user_b, 'owner', now());

    -- Seed one item per org so SELECT/INSERT/UPDATE assertions have rows.
    -- Schema: items requires (organization_id, sku, name, rental_price, replacement_cost) — sku UNIQUE NOT NULL.
    -- Use status='maintenance' so the "Public can view active items" policy (00053:205) does NOT fire,
    -- letting us test pure per-org RLS isolation. status='active' would expose items cross-tenant by design
    -- (public storefront browsing path) and is not what this test validates.
    INSERT INTO items (organization_id, sku, name, rental_price, replacement_cost, status)
    VALUES
        (v_org_a, 'PGTAP-A-1', 'Item-A', 10, 100, 'maintenance'),
        (v_org_b, 'PGTAP-B-1', 'Item-B', 20, 200, 'maintenance')
    ON CONFLICT DO NOTHING;

    PERFORM set_config('test.org_a', v_org_a::text, false);
    PERFORM set_config('test.org_b', v_org_b::text, false);
    PERFORM set_config('test.user_a', v_user_a::text, false);
    PERFORM set_config('test.user_b', v_user_b::text, false);
END $$;

-- BRIEF-54 v3 fixtures: one draft lookbook per org with one item.
-- Drafts (not published) so the storefront permissive policy doesn't kick in
-- and the cross-tenant member/admin policies are what's actually exercised.
DO $$
DECLARE
    v_lookbook_a UUID := gen_random_uuid();
    v_lookbook_b UUID := gen_random_uuid();
BEGIN
    INSERT INTO pdf_lookbooks (id, organization_id, slug, title, page_count, published, editor_status)
    VALUES
        (v_lookbook_a, current_setting('test.org_a')::uuid, 'pgtap-a-lookbook', 'pgTAP A LB', 5, false, 'draft'),
        (v_lookbook_b, current_setting('test.org_b')::uuid, 'pgtap-b-lookbook', 'pgTAP B LB', 5, false, 'draft');

    INSERT INTO pdf_lookbook_items (lookbook_id, inventory_item_id, page_number, match_status)
    VALUES
        (v_lookbook_a, (SELECT id FROM items WHERE sku = 'PGTAP-A-1'), 1, 'needs_review'),
        (v_lookbook_b, (SELECT id FROM items WHERE sku = 'PGTAP-B-1'), 1, 'needs_review');

    PERFORM set_config('test.lookbook_a', v_lookbook_a::text, false);
    PERFORM set_config('test.lookbook_b', v_lookbook_b::text, false);
END $$;

-- ============================================================
-- 2. Switch to authenticated as user A in org A and assert visibility
-- ============================================================
SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', current_setting('test.user_a'),
        'role', 'authenticated',
        'app_metadata', json_build_object(
            'current_org_id', current_setting('test.org_a')
        )
    )::text,
    true
);

-- 2.1 organizations: A sees its own, not B's
SELECT is(
    (SELECT count(*)::int FROM organizations WHERE id = current_setting('test.org_a')::uuid),
    1,
    'org A user can SELECT own organization'
);

SELECT is(
    (SELECT count(*)::int FROM organizations WHERE id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot SELECT org B organization row'
);

-- 2.2 organization_members: A sees only its own org's members
SELECT is(
    (SELECT count(*)::int FROM organization_members WHERE organization_id = current_setting('test.org_a')::uuid),
    1,
    'org A user sees own organization_members row'
);

SELECT is(
    (SELECT count(*)::int FROM organization_members WHERE organization_id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot see org B membership rows'
);

-- 2.3 items: SELECT scoped by current_org_id() = org A
SELECT is(
    (SELECT count(*)::int FROM items WHERE organization_id = current_setting('test.org_a')::uuid),
    1,
    'org A user can SELECT items.organization_id = A'
);

SELECT is(
    (SELECT count(*)::int FROM items WHERE organization_id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot SELECT items.organization_id = B (RLS blocks)'
);

-- 2.4 reservations: empty for both — ensure no leak from B (if seeded)
SELECT is(
    (SELECT count(*)::int FROM reservations WHERE organization_id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot SELECT reservations.organization_id = B'
);

-- 2.5 categories: same RLS pattern
SELECT is(
    (SELECT count(*)::int FROM categories WHERE organization_id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot SELECT categories.organization_id = B'
);

-- 2.6 invoices: same RLS pattern
SELECT is(
    (SELECT count(*)::int FROM invoices WHERE organization_id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot SELECT invoices.organization_id = B'
);

-- 2.7 organization_invitations: A admin cannot list B's invitations
SELECT is(
    (SELECT count(*)::int FROM organization_invitations WHERE organization_id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot SELECT organization_invitations.organization_id = B'
);

-- ============================================================
-- 3. Cross-tenant write blocked
-- ============================================================
-- 3.1 INSERT into items with organization_id = B (RLS WITH CHECK should reject)
SELECT throws_ok(
    $sql$ INSERT INTO items (organization_id, sku, name, rental_price, replacement_cost)
          VALUES (current_setting('test.org_b')::uuid, 'PGTAP-X-1', 'cross-tenant-attempt', 1, 1) $sql$,
    NULL,
    NULL,
    'org A user INSERT into items with org B id is rejected by RLS'
);

-- 3.2 UPDATE org B items — data-modifying CTE must be at statement top level
WITH upd AS (
    UPDATE items SET name = 'tampered'
    WHERE organization_id = current_setting('test.org_b')::uuid
    RETURNING 1
),
counted AS (SELECT count(*)::int AS n FROM upd)
SELECT is(counted.n, 0, 'org A user UPDATE of org B items affects 0 rows (RLS)') FROM counted;

-- 3.3 INSERT into organization_members for org B
SELECT throws_ok(
    $sql$ INSERT INTO organization_members (organization_id, user_id, role, accepted_at)
          VALUES (
              current_setting('test.org_b')::uuid,
              current_setting('test.user_a')::uuid,
              'admin',
              now()
          ) $sql$,
    NULL,
    NULL,
    'org A user cannot INSERT membership into org B'
);

-- 3.4 helper functions agree: current_org_id() = org A, NOT org B
SELECT is(
    (SELECT current_org_id()),
    current_setting('test.org_a')::uuid,
    'current_org_id() reads from JWT app_metadata.current_org_id (= org A)'
);

-- ============================================================
-- 4. BRIEF-54 v3: cross-tenant pdf_lookbooks / pdf_lookbook_items
-- ============================================================
-- 4.1 SELECT pdf_lookbooks.organization_id = B as org A authenticated user.
-- Drafts only — neither the storefront permissive policy nor the org-member
-- policy should let A see B's draft lookbook.
SELECT is(
    (SELECT count(*)::int FROM pdf_lookbooks WHERE organization_id = current_setting('test.org_b')::uuid),
    0,
    'org A user cannot SELECT pdf_lookbooks.organization_id = B (draft, RLS blocks)'
);

-- 4.2 SELECT pdf_lookbook_items in org B's lookbook.
SELECT is(
    (SELECT count(*)::int FROM pdf_lookbook_items WHERE lookbook_id = current_setting('test.lookbook_b')::uuid),
    0,
    'org A user cannot SELECT pdf_lookbook_items in org B lookbook (RLS blocks)'
);

-- 4.3 INSERT into pdf_lookbooks with org B id — admin policy WITH CHECK rejects.
SELECT throws_ok(
    $sql$ INSERT INTO pdf_lookbooks (organization_id, slug, title)
          VALUES (current_setting('test.org_b')::uuid, 'pgtap-x-lookbook', 'cross-tenant-attempt') $sql$,
    NULL,
    NULL,
    'org A user INSERT into pdf_lookbooks with org B id is rejected by RLS'
);

-- 4.4 UPDATE pdf_lookbook_items in org B's lookbook — admin policy USING blocks (0 rows).
WITH upd AS (
    UPDATE pdf_lookbook_items SET admin_notes = 'tampered'
    WHERE lookbook_id = current_setting('test.lookbook_b')::uuid
    RETURNING 1
),
counted AS (SELECT count(*)::int AS n FROM upd)
SELECT is(counted.n, 0, 'org A user UPDATE of org B pdf_lookbook_items affects 0 rows (RLS)') FROM counted;

-- ============================================================
-- Done
-- ============================================================
SELECT * FROM finish();

ROLLBACK;
