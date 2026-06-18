-- Deprecated safety shim.
--
-- The old version of this migration recreated list_sold_items_report using the
-- current menu table, which makes historical reports change after menu edits.
-- The final hardening migration uses order item snapshots instead.
--
-- Run:
-- supabase/migrations/20250515161000_one_copy_app_repair.sql

DO $$
BEGIN
  RAISE NOTICE '20250515159500 is deprecated. Run 20250515161000_one_copy_app_repair.sql for the snapshot-safe sold-items report.';
END;
$$;
