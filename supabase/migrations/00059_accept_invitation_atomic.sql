-- Migration 00059: accept_invitation_atomic RPC
-- Wraps membership INSERT + invitation accepted_at UPDATE + profile last_active_org_id
-- in a single transaction to prevent partial-accept state (BRIEF-42 F3 fix).

BEGIN;

CREATE OR REPLACE FUNCTION accept_invitation_atomic(
    p_invitation_id UUID,
    p_user_id UUID,
    p_organization_id UUID,
    p_role TEXT,
    p_invited_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
BEGIN
    -- Only the authenticated user can accept for themselves
    IF v_caller IS NULL OR v_caller != p_user_id THEN
        RAISE EXCEPTION 'Cannot accept invitation for another user'
            USING ERRCODE = '42501';
    END IF;

    -- Lock and mark invitation as accepted (atomically prevents double-accept)
    UPDATE organization_invitations
       SET accepted_at = NOW()
     WHERE id = p_invitation_id
       AND accepted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation already accepted or does not exist'
            USING ERRCODE = 'P0002';
    END IF;

    -- Insert membership
    INSERT INTO organization_members (
        organization_id, user_id, role, invited_by, accepted_at
    ) VALUES (
        p_organization_id, p_user_id, p_role, p_invited_by, NOW()
    );

    -- Stamp profile for JWT hook
    UPDATE profiles
       SET last_active_org_id = p_organization_id,
           updated_at = NOW()
     WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION accept_invitation_atomic(UUID, UUID, UUID, TEXT, UUID) FROM public;
GRANT EXECUTE ON FUNCTION accept_invitation_atomic(UUID, UUID, UUID, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
