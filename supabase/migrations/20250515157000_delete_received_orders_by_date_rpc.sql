-- Deprecated safety shim.
--
-- The old version of this migration permanently deleted received orders,
-- order items, and payments. The current app keeps receipt history and
-- voids received orders through the final hardening migration instead.
--
-- Run:
-- supabase/migrations/20250515161000_one_copy_app_repair.sql

DO $$
BEGIN
  RAISE NOTICE '20250515157000 is deprecated. Run 20250515161000_one_copy_app_repair.sql for void-based receipt cleanup.';
END;
$$;
