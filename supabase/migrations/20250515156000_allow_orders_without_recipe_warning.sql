-- Deprecated safety shim.
--
-- The current confirm_pos_order implementation lives in:
-- supabase/migrations/20250515161000_harden_orders_inventory_and_reports.sql

DO $$
BEGIN
  RAISE NOTICE '20250515156000 is deprecated. Run 20250515161000_harden_orders_inventory_and_reports.sql for the current order RPC.';
END;
$$;
