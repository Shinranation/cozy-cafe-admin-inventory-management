-- Cozy Cafe Queue: guarded admin-only delete for one received-order date.
-- This removes received orders in the selected date range plus their payments
-- and order line items. Inventory quantities are not changed.

CREATE OR REPLACE FUNCTION public.delete_received_orders_by_date(
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
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
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'delete_received_orders_by_date: not authorized (admin role required)';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at >= p_end_at THEN
    RAISE EXCEPTION 'delete_received_orders_by_date: invalid date range';
  END IF;

  IF lower(trim(coalesce(p_confirm_email, ''))) <> lower(trim(v_auth_email)) THEN
    RAISE EXCEPTION 'delete_received_orders_by_date: account email confirmation did not match';
  END IF;

  IF trim(coalesce(p_confirm_action, '')) <> 'DELETE RECEIPTS' THEN
    RAISE EXCEPTION 'delete_received_orders_by_date: first confirmation phrase did not match';
  END IF;

  IF trim(coalesce(p_confirm_scope, '')) <> 'DELETE SELECTED DATE' THEN
    RAISE EXCEPTION 'delete_received_orders_by_date: second confirmation phrase did not match';
  END IF;

  CREATE TEMP TABLE tmp_received_orders_to_delete ON COMMIT DROP AS
  SELECT o.order_id
  FROM public.orders o
  WHERE o.status = 'received'
    AND o.created_at >= p_start_at
    AND o.created_at < p_end_at;

  DELETE FROM public.payments p
  USING tmp_received_orders_to_delete d
  WHERE p.order_id = d.order_id;
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

  DELETE FROM public.order_items oi
  USING tmp_received_orders_to_delete d
  WHERE oi.order_id = d.order_id;
  GET DIAGNOSTICS v_deleted_order_items = ROW_COUNT;

  DELETE FROM public.orders o
  USING tmp_received_orders_to_delete d
  WHERE o.order_id = d.order_id
    AND o.status = 'received';
  GET DIAGNOSTICS v_deleted_orders = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_payments', v_deleted_payments,
    'deleted_order_items', v_deleted_order_items,
    'deleted_orders', v_deleted_orders
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_received_orders_by_date(timestamp with time zone, timestamp with time zone, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_received_orders_by_date(timestamp with time zone, timestamp with time zone, text, text, text) TO authenticated;
