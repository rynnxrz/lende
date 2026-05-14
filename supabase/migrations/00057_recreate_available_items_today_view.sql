-- ============================================================
-- Migration 00057: Recreate available_items_today view with org scope
-- Depends: 00001 (original view), 00052 (current_org_id), 00053 (org_id on items)
-- ============================================================
-- The original view (00001) has no org filter. Now that items are org-scoped,
-- this view must filter by the current user's organization to prevent
-- cross-tenant data leakage.
-- ============================================================

DROP VIEW IF EXISTS available_items_today;

CREATE OR REPLACE VIEW available_items_today AS
SELECT i.*
FROM items i
WHERE i.status = 'active'
  AND i.organization_id = current_org_id()
  AND check_item_availability(i.id, CURRENT_DATE, CURRENT_DATE);
