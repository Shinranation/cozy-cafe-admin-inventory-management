-- Deprecated safety shim.
--
-- This local migration has been superseded by the final hardened order,
-- inventory, and reporting migration.
--
-- Run:
-- supabase/migrations/20250515161000_one_copy_app_repair.sql

DO $$
BEGIN
  RAISE NOTICE '20250515150000 is deprecated. Run 20250515161000_one_copy_app_repair.sql for the current order/report functions.';
END;
$$;
