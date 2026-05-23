-- Cozy Cafe Revenue: guarded admin-only reset for revenue reporting data.
-- This clears orders, order line items, payments, and expenses. It does not
-- reset inventory quantities or menu/ingredient setup.

CREATE OR REPLACE FUNCTION public.reset_revenue_data(
  p_confirm_email text,
  p_confirm_action text,
  p_confirm_scope text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email text := coalesce(auth.jwt() ->> 'email', '');
  v_deleted_payments bigint := 0;
  v_deleted_order_items bigint := 0;
  v_deleted_orders bigint := 0;
  v_deleted_expenses bigint := 0;
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'reset_revenue_data: not authorized (admin role required)';
  END IF;

  IF lower(trim(coalesce(p_confirm_email, ''))) <> lower(trim(v_auth_email)) THEN
    RAISE EXCEPTION 'reset_revenue_data: account email confirmation did not match';
  END IF;

  IF trim(coalesce(p_confirm_action, '')) <> 'RESET REVENUE' THEN
    RAISE EXCEPTION 'reset_revenue_data: first confirmation phrase did not match';
  END IF;

  IF trim(coalesce(p_confirm_scope, '')) <> 'DELETE ORDERS AND EXPENSES' THEN
    RAISE EXCEPTION 'reset_revenue_data: second confirmation phrase did not match';
  END IF;

  DELETE FROM public.payments;
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

  DELETE FROM public.order_items;
  GET DIAGNOSTICS v_deleted_order_items = ROW_COUNT;

  DELETE FROM public.orders;
  GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;

  DELETE FROM public.expenses;
  GET DIAGNOSTICS v_deleted_expenses = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_payments', v_deleted_payments,
    'deleted_order_items', v_deleted_order_items,
    'deleted_orders', v_deleted_orders,
    'deleted_expenses', v_deleted_expenses
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_revenue_data(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_revenue_data(text, text, text) TO authenticated;
