-- Deprecated safety shim.
--
-- The old version of this migration permanently deleted payments, order items,
-- orders, and expenses. The current app uses the final hardening migration,
-- which voids active orders and restores sale inventory deductions instead.
--
-- Run:
-- supabase/migrations/20250515161000_one_copy_app_repair.sql

DO $$
BEGIN
  RAISE NOTICE '20250515144000 is deprecated. Run 20250515161000_one_copy_app_repair.sql for the safe revenue reset RPC.';
END;
$$;
