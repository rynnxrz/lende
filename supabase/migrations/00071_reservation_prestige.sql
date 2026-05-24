-- Prestige ranking columns on the existing reservation_group_assessments table.
-- See plan: /Users/rz/.claude/plans/prototyped-an-ai-agent-shimmering-mountain.md
--
-- All statements are idempotent so the migration is safe to re-run.

ALTER TABLE reservation_group_assessments
  ADD COLUMN IF NOT EXISTS prestige_score INTEGER,
  ADD COLUMN IF NOT EXISTS prestige_tier TEXT,
  ADD COLUMN IF NOT EXISTS prestige JSONB,
  ADD COLUMN IF NOT EXISTS prestige_generated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rga_prestige_tier_check'
  ) THEN
    ALTER TABLE reservation_group_assessments
      ADD CONSTRAINT rga_prestige_tier_check
      CHECK (prestige_tier IS NULL OR prestige_tier IN ('iconic','red_carpet','editorial','standard','unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rga_prestige_score
  ON reservation_group_assessments (prestige_score DESC NULLS LAST);
