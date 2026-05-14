-- Migration 00065: org engagement_score function (D38 v0)
--
-- BRIEF-61 admin-way step 1: a single SQL function that returns a
-- 0..100 score for one organization, used by the system-admin
-- "Active Trials" dashboard to triage which trials need attention.
--
-- The 5-signal weighting comes from D38 v0 (locked 5/10 16:35 CST):
--
--   1.0 × min(items_count, 50) / 50              -- inventory depth (cap at 50)
-- + 1.5 × min(reservations_count, 20) / 20       -- business actually running (heaviest weight)
-- + 1.0 × (1 if last_login_within_7d else 0)     -- recency
-- + 0.5 × (1 if team_size >= 2 else 0)           -- virality (B2B head signal)
-- + 1.0 × (1 if activation_within_1hr else 0)    -- TTV speed
--   = 0..5 raw, normalized to 0..100 (× 100 / 5)
--
-- The weights reflect "n < 5 paid client" ground truth — once n >= 10
-- we plan a regression pass to refine them (LOG NOTE in BRIEF-61).
--
-- Color tiers (UI-side, not enforced here):
--   hot ≥ 60, warm 30-59, stale < 30, dead = 0 + no login 5d
--
-- Auxiliary changes:
--   - profiles.last_active_at column (NULL allowed) — written by middleware
--     on each authenticated request, throttled to ≥ 5 min between writes.

BEGIN;

-- ============================================================
-- profiles.last_active_at — middleware updates this on every
-- authenticated request (throttled). Read by engagement_score
-- and by the dashboard's "Last activity" column.
-- ============================================================
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
    ON profiles(last_active_at DESC) WHERE last_active_at IS NOT NULL;

-- ============================================================
-- engagement_score(p_org_id UUID) RETURNS NUMERIC (0..100)
-- ============================================================
CREATE OR REPLACE FUNCTION engagement_score(p_org_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_items_count INT;
    v_reservations_count INT;
    v_last_login_within_7d BOOL;
    v_team_size INT;
    v_activation_within_1hr BOOL;
    v_first_item_at TIMESTAMPTZ;
    v_org_created_at TIMESTAMPTZ;
    v_score NUMERIC;
BEGIN
    -- 1) inventory depth (cap at 50)
    SELECT COUNT(*) INTO v_items_count
        FROM items
        WHERE organization_id = p_org_id;

    -- 2) reservations count (cap at 20)
    SELECT COUNT(*) INTO v_reservations_count
        FROM reservations
        WHERE organization_id = p_org_id;

    -- 3) last login within 7d — any team member's profiles.last_active_at
    SELECT
        COALESCE(MAX(p.last_active_at), 'epoch'::TIMESTAMPTZ)
            > NOW() - INTERVAL '7 days'
    INTO v_last_login_within_7d
    FROM organization_members om
    JOIN profiles p ON p.id = om.user_id
    WHERE om.organization_id = p_org_id;

    -- 4) team size (>= 2 = virality signal)
    SELECT COUNT(*) INTO v_team_size
        FROM organization_members
        WHERE organization_id = p_org_id;

    -- 5) activation within 1 hour: first item created < 1hr after org created
    SELECT created_at INTO v_org_created_at
        FROM organizations
        WHERE id = p_org_id;
    SELECT MIN(created_at) INTO v_first_item_at
        FROM items
        WHERE organization_id = p_org_id;

    v_activation_within_1hr := COALESCE(
        v_first_item_at IS NOT NULL
            AND v_first_item_at - v_org_created_at < INTERVAL '1 hour',
        FALSE
    );

    -- weighted sum, normalized to 0..100
    v_score := (
          1.0 * LEAST(v_items_count, 50)::NUMERIC / 50.0
        + 1.5 * LEAST(v_reservations_count, 20)::NUMERIC / 20.0
        + 1.0 * (CASE WHEN v_last_login_within_7d THEN 1 ELSE 0 END)
        + 0.5 * (CASE WHEN v_team_size >= 2 THEN 1 ELSE 0 END)
        + 1.0 * (CASE WHEN v_activation_within_1hr THEN 1 ELSE 0 END)
    ) * 100.0 / 5.0;

    RETURN ROUND(v_score, 1);
END;
$$;

REVOKE ALL ON FUNCTION engagement_score(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engagement_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION engagement_score(UUID) TO service_role;

COMMENT ON FUNCTION engagement_score(UUID) IS
    'BRIEF-61 / D38 v0 — 5-signal weighted engagement score (0..100). '
    'Weights: items 1.0, reservations 1.5, recency 1.0, team 0.5, TTV 1.0. '
    'Used by /system-admin/orgs Active Trials dashboard. '
    'Refine weights after n >= 10 paid clients (regression pass).';

NOTIFY pgrst, 'reload schema';

COMMIT;
