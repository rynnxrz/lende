-- Migration 00064: accept_invitation_atomic v2
--
-- BRIEF-59 — extend the v1 RPC (00059) to:
--   1. Accept p_mode ('new' | 'existing') so the existing-user branch
--      in src/app/actions/invitations/accept.ts can route through the
--      same atomic primitive without divergent SQL.
--   2. Skip the profile.last_active_org_id stamp when the user is
--      *already* a member of another org and we're just adding a
--      second one. The set_active_organization RPC (00054) is the
--      right tool for switching the *active* org afterwards. Stamping
--      last_active here would silently override a user's existing
--      active-org choice, which is wrong UX.
--   3. Insert an immutable audit row in invitation_accept_events
--      (00063) inside the same transaction. Any failure rolls back
--      both the membership grant and the audit row.
--
-- Compatibility:
--   The 5-arg version from 00059 is *dropped* to avoid an overload
--   ambiguity (a 5-arg call would otherwise match either definition
--   since p_mode + p_source_ip have defaults on the v2). Callers
--   that omit p_mode / p_source_ip on the v2 still work — defaults
--   apply — so the existing six-scenarios.test.ts integration tests
--   continue to pass without code changes.

BEGIN;

-- Drop the 5-arg v1 from 00059 (idempotent — IF EXISTS guards reruns).
DROP FUNCTION IF EXISTS accept_invitation_atomic(UUID, UUID, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION accept_invitation_atomic(
    p_invitation_id UUID,
    p_user_id UUID,
    p_organization_id UUID,
    p_role TEXT,
    p_invited_by UUID DEFAULT NULL,
    p_mode TEXT DEFAULT 'new',
    p_source_ip TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    -- Only the authenticated user can accept for themselves.
    IF v_caller IS NULL OR v_caller != p_user_id THEN
        RAISE EXCEPTION 'Cannot accept invitation for another user'
            USING ERRCODE = '42501';
    END IF;

    IF p_mode NOT IN ('new', 'existing') THEN
        RAISE EXCEPTION 'Invalid mode %', p_mode
            USING ERRCODE = '22023';
    END IF;

    -- Lock + mark invitation accepted (atomic — prevents double-accept).
    UPDATE organization_invitations
       SET accepted_at = NOW()
     WHERE id = p_invitation_id
       AND accepted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation already accepted or does not exist'
            USING ERRCODE = 'P0002';
    END IF;

    -- Insert membership.
    INSERT INTO organization_members (
        organization_id, user_id, role, invited_by, accepted_at
    ) VALUES (
        p_organization_id, p_user_id, p_role, p_invited_by, NOW()
    );

    -- For new users, stamp profile.last_active_org_id so the
    -- custom_access_token_hook puts the right org into the JWT on the
    -- next refresh. For existing users joining a *second* org, do not
    -- override their previous choice — set_active_organization is the
    -- explicit switch path.
    IF p_mode = 'new' THEN
        UPDATE profiles
           SET last_active_org_id = p_organization_id,
               updated_at = NOW()
         WHERE id = p_user_id;
    END IF;

    -- Audit row (BRIEF-59 risk #1 mitigation). Append-only by
    -- construction — see 00063 RLS.
    INSERT INTO invitation_accept_events (
        user_id, organization_id, invitation_id, mode, source_ip
    ) VALUES (
        p_user_id, p_organization_id, p_invitation_id, p_mode, p_source_ip
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION accept_invitation_atomic(UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION accept_invitation_atomic(UUID, UUID, UUID, TEXT, UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
