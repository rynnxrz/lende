-- Migration 00063: invitation_accept_events audit table
--
-- BRIEF-59 risk #1 + #2 mitigation: every successful invitation accept
-- (regardless of mode='new' or 'existing') leaves an immutable audit
-- row recording which user joined which org, when, by what mode, and
-- from what source IP (when present).
--
-- The downstream BRIEF-59 RPC v2 (00064) is responsible for inserting
-- the row inside the same SECURITY DEFINER transaction that grants
-- membership — see 00064 for the wiring.
--
-- RLS:
--   - users can read their own accept events (helps a user verify
--     "did my account just get added to a new org I didn't expect?")
--   - org owners + admins can read every accept event for their org
--     (operator visibility into who joined when)

BEGIN;

CREATE TABLE IF NOT EXISTS invitation_accept_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invitation_id UUID REFERENCES organization_invitations(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mode TEXT NOT NULL CHECK (mode IN ('new', 'existing')),
    source_ip TEXT
);

CREATE INDEX IF NOT EXISTS invitation_accept_events_user_id_idx
    ON invitation_accept_events (user_id);
CREATE INDEX IF NOT EXISTS invitation_accept_events_org_id_idx
    ON invitation_accept_events (organization_id, accepted_at DESC);

ALTER TABLE invitation_accept_events ENABLE ROW LEVEL SECURITY;

-- A user can read every accept event tied to their own user_id. This
-- gives the user a way to detect "I was added to org X without my
-- knowledge" if it ever happens.
DROP POLICY IF EXISTS user_can_read_own_accept_events ON invitation_accept_events;
CREATE POLICY user_can_read_own_accept_events
    ON invitation_accept_events
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Org owners + admins can read every accept event tied to their org.
-- Operator visibility for "who joined when".
DROP POLICY IF EXISTS admin_can_read_org_accept_events ON invitation_accept_events;
CREATE POLICY admin_can_read_org_accept_events
    ON invitation_accept_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
             WHERE om.user_id = auth.uid()
               AND om.organization_id = invitation_accept_events.organization_id
               AND om.role IN ('owner', 'admin')
        )
    );

-- No INSERT / UPDATE / DELETE policies → rows can only be written via
-- SECURITY DEFINER RPC (00064 accept_invitation_atomic_v2). Append-only
-- by construction.

NOTIFY pgrst, 'reload schema';

COMMIT;
