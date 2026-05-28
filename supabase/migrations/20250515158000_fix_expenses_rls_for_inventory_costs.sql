-- Cozy Cafe Revenue: allow admin app users to record inventory stock-in costs.
-- Fixes expenses INSERT being blocked by older RLS policies that referenced
-- a different admin helper.

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select_authenticated" ON public.expenses;
CREATE POLICY "expenses_select_authenticated"
ON public.expenses
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "expenses_modify_admin_only" ON public.expenses;
CREATE POLICY "expenses_modify_admin_only"
ON public.expenses
FOR ALL
TO authenticated
USING (public.is_admin_app_user())
WITH CHECK (public.is_admin_app_user());
