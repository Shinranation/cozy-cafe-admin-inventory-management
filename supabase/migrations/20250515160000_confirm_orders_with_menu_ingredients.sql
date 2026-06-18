-- Deprecated safety shim.
--
-- This migration used to overwrite confirm_pos_order with a recipe-required
-- version. The current app allows menu items without recipe links and uses
-- menu_ingredients only when they exist.
--
-- Run this final hardening migration instead:
-- supabase/migrations/20250515161000_one_copy_app_repair.sql

DO $$
BEGIN
  RAISE NOTICE '20250515160000 is deprecated. Run 20250515161000_one_copy_app_repair.sql for the current order function.';
END;
$$;
