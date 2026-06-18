-- Deprecated safety shim.
--
-- This local migration has been superseded by the final hardened order,
-- inventory, and reporting migration.
--
-- Run:
-- supabase/migrations/20250515161000_harden_orders_inventory_and_reports.sql

DO $$
BEGIN
  RAISE NOTICE '20250515150000 is deprecated. Run 20250515161000_harden_orders_inventory_and_reports.sql for the current order/report functions.';
END;
$$;
