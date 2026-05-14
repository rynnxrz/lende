-- Migration 00060: invitation email CITEXT (BRIEF-42 F5)
-- Expand phase: add CITEXT extension + alter column type.
-- Mixed-case duplicates prevented at the DB level.

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE organization_invitations
    ALTER COLUMN email TYPE citext;

NOTIFY pgrst, 'reload schema';

COMMIT;
