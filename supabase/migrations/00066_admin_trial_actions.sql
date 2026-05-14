-- Migration 00066: admin trial-management RPCs + audit table
--
-- BRIEF-61 admin-way step 2: three SECURITY DEFINER RPCs that the
-- system-admin "Active Trials" dashboard calls when Rongze clicks one
-- of the per-row action buttons:
--
--   1. extend_trial(p_org_id, p_days)
--      → trial_ends_at += p_days; audit row inserted.
--
--   2. set_subscription_active(p_org_id, p_subscription_id)
--      → subscription_status := 'active'; subscription_id := arg;
--        plan := 'starter' if currently 'trial'; audit row.
--
--   3. deactivate_org(p_org_id, p_reason)
--      → subscription_status := 'cancelled'; audit row.
--        (Data preserved 90 days. Archival cron is a separate brief.)
--
-- All three are gated to system-admin only (caller's email must appear
-- in the SYSTEM_ADMIN_EMAILS allowlist below — kept in lockstep with
-- src/app/system-admin/orgs/page.tsx). When called via service-role
-- key (e.g. from the cron route or Mac terminal Claude Code) the
-- check is bypassed because the RPC body sees the caller as the
-- service role.
--
-- Audit:
--   org_admin_events table — append-only, FK-cascaded to organizations.
--   Every write from these three RPCs leaves one row.

BEGIN;

-- ============================================================
-- 1) org_admin_events audit table
-- ============================================================
CREATE TABLE IF NOT EXISTS org_admin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN (
        'extend_trial',
        'set_subscription_active',
        'deactivate_org',
        'personal_email_sent'
    )),
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_admin_events_org
    ON org_admin_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_admin_events_action
    ON org_admin_events(action, created_at DESC);

ALTER TABLE org_admin_events ENABLE ROW LEVEL SECURITY;

-- Org owners + admins can read their org's audit trail.
DROP POLICY IF EXISTS owner_admin_read_org_admin_events ON org_admin_events;
CREATE POLICY owner_admin_read_org_admin_events
    ON org_admin_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
             WHERE om.user_id = auth.uid()
               AND om.organization_id = org_admin_events.organization_id
               AND om.role IN ('owner', 'admin')
        )
    );

-- No INSERT / UPDATE / DELETE policies → only the SECURITY DEFINER
-- RPCs in this file can write. Append-only by construction.

-- ============================================================
-- helper: is_system_admin() — check caller against allowlist
-- ============================================================
-- Mirrors SYSTEM_ADMIN_EMAILS in src/app/system-admin/orgs/page.tsx.
-- Returns TRUE for the service-role caller (auth.uid() IS NULL when
-- service-role) so cron routes / test harnesses can call these RPCs.
CREATE OR REPLACE FUNCTION is_system_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
BEGIN
    -- service-role / no auth context → allow (cron + tests)
    IF v_uid IS NULL THEN
        RETURN TRUE;
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    RETURN v_email IS NOT NULL
        AND v_email = ANY(ARRAY[
            'rongze.work@gmail.com'
            -- keep this list in lockstep with
            -- src/app/system-admin/orgs/page.tsx SYSTEM_ADMIN_EMAILS
        ]);
END;
$$;

REVOKE ALL ON FUNCTION is_system_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_system_admin() TO service_role;

-- ============================================================
-- 2) extend_trial(p_org_id, p_days)
-- ============================================================
CREATE OR REPLACE FUNCTION extend_trial(
    p_org_id UUID,
    p_days INT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_ends TIMESTAMPTZ;
    v_actor UUID := auth.uid();
BEGIN
    IF NOT is_system_admin() THEN
        RAISE EXCEPTION 'permission denied: extend_trial requires system admin';
    END IF;
    IF p_days IS NULL OR p_days <= 0 OR p_days > 90 THEN
        RAISE EXCEPTION 'p_days must be between 1 and 90 (got %)', p_days;
    END IF;

    UPDATE organizations
        SET trial_ends_at = COALESCE(trial_ends_at, NOW())
            + (p_days || ' days')::INTERVAL,
            updated_at = NOW()
        WHERE id = p_org_id
        RETURNING trial_ends_at INTO v_new_ends;

    IF v_new_ends IS NULL THEN
        RAISE EXCEPTION 'organization % not found', p_org_id;
    END IF;

    INSERT INTO org_admin_events (organization_id, actor_user_id, action, payload)
        VALUES (
            p_org_id,
            v_actor,
            'extend_trial',
            jsonb_build_object('days', p_days, 'new_trial_ends_at', v_new_ends)
        );

    RETURN v_new_ends;
END;
$$;

REVOKE ALL ON FUNCTION extend_trial(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION extend_trial(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION extend_trial(UUID, INT) TO service_role;

-- ============================================================
-- 3) set_subscription_active(p_org_id, p_subscription_id)
-- ============================================================
CREATE OR REPLACE FUNCTION set_subscription_active(
    p_org_id UUID,
    p_subscription_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := auth.uid();
    v_existing TEXT;
BEGIN
    IF NOT is_system_admin() THEN
        RAISE EXCEPTION 'permission denied: set_subscription_active requires system admin';
    END IF;
    IF p_subscription_id IS NULL OR length(trim(p_subscription_id)) = 0 THEN
        RAISE EXCEPTION 'p_subscription_id is required';
    END IF;

    SELECT subscription_status INTO v_existing
        FROM organizations WHERE id = p_org_id;

    IF v_existing IS NULL AND NOT FOUND THEN
        -- v_existing IS NULL is allowed (means "trialing-implicit")
        NULL;
    END IF;

    UPDATE organizations
        SET subscription_status = 'active',
            subscription_id = p_subscription_id,
            plan = CASE WHEN plan = 'trial' THEN 'starter' ELSE plan END,
            updated_at = NOW()
        WHERE id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization % not found', p_org_id;
    END IF;

    INSERT INTO org_admin_events (organization_id, actor_user_id, action, payload)
        VALUES (
            p_org_id,
            v_actor,
            'set_subscription_active',
            jsonb_build_object('subscription_id', p_subscription_id)
        );
END;
$$;

REVOKE ALL ON FUNCTION set_subscription_active(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_subscription_active(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_subscription_active(UUID, TEXT) TO service_role;

-- ============================================================
-- 4) deactivate_org(p_org_id, p_reason)
-- ============================================================
CREATE OR REPLACE FUNCTION deactivate_org(
    p_org_id UUID,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := auth.uid();
BEGIN
    IF NOT is_system_admin() THEN
        RAISE EXCEPTION 'permission denied: deactivate_org requires system admin';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'p_reason is required (>= 3 chars)';
    END IF;

    UPDATE organizations
        SET subscription_status = 'cancelled',
            updated_at = NOW()
        WHERE id = p_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'organization % not found', p_org_id;
    END IF;

    INSERT INTO org_admin_events (organization_id, actor_user_id, action, payload)
        VALUES (
            p_org_id,
            v_actor,
            'deactivate_org',
            jsonb_build_object('reason', p_reason)
        );

    -- Data is preserved (no DELETE). Archival happens 90 days later via
    -- a separate cron job (not in scope for BRIEF-61).
END;
$$;

REVOKE ALL ON FUNCTION deactivate_org(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deactivate_org(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_org(UUID, TEXT) TO service_role;

-- ============================================================
-- 5) log_personal_email(p_org_id, p_template_key)
-- ============================================================
-- Called from the dashboard "Send personal email" modal AFTER the
-- mailto: launches. Records "Rongze opened the compose for org X
-- using template Y at time Z". The email body itself is not stored
-- (privacy) — the dashboard only gives Rongze a paste-ready draft.
CREATE OR REPLACE FUNCTION log_personal_email(
    p_org_id UUID,
    p_template_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID := auth.uid();
BEGIN
    IF NOT is_system_admin() THEN
        RAISE EXCEPTION 'permission denied: log_personal_email requires system admin';
    END IF;

    INSERT INTO org_admin_events (organization_id, actor_user_id, action, payload)
        VALUES (
            p_org_id,
            v_actor,
            'personal_email_sent',
            jsonb_build_object('template', COALESCE(p_template_key, 'custom'))
        );
END;
$$;

REVOKE ALL ON FUNCTION log_personal_email(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_personal_email(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION log_personal_email(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
