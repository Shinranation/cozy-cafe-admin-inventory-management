-- The Cozzy Cup Cafe: revert or delete specific received receipts by order ID.
-- Revert keeps receipt history by marking orders as voided.
-- Delete permanently removes the receipt rows.
-- Both actions restore matching sale inventory deductions for only the selected
-- receipts.

CREATE OR REPLACE FUNCTION public.void_received_orders_by_ids(
  p_order_ids bigint[],
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
  v_requested_orders bigint := 0;
  v_voided_orders bigint := 0;
  v_voided_sales_amount double precision := 0;
  v_restored_transactions bigint := 0;
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'void_received_orders_by_ids: not authorized (admin role required)';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'void_received_orders_by_ids: at least one order_id is required';
  END IF;

  IF lower(trim(coalesce(p_confirm_email, ''))) <> lower(coalesce(auth.jwt() ->> 'email', '')) THEN
    RAISE EXCEPTION 'void_received_orders_by_ids: account email confirmation did not match';
  END IF;

  IF trim(coalesce(p_confirm_action, '')) NOT IN ('REVERT RECEIPTS', 'VOID RECEIPTS') THEN
    RAISE EXCEPTION 'void_received_orders_by_ids: first confirmation phrase did not match';
  END IF;

  IF trim(coalesce(p_confirm_scope, '')) NOT IN ('REVERT SELECTED RECEIPTS', 'VOID SELECTED RECEIPTS') THEN
    RAISE EXCEPTION 'void_received_orders_by_ids: second confirmation phrase did not match';
  END IF;

  DROP TABLE IF EXISTS tmp_requested_order_ids;
  DROP TABLE IF EXISTS tmp_received_orders_to_void;
  DROP TABLE IF EXISTS tmp_inventory_reversals;

  CREATE TEMP TABLE tmp_requested_order_ids ON COMMIT DROP AS
  SELECT DISTINCT unnest(p_order_ids)::bigint AS order_id;

  SELECT COUNT(*) INTO v_requested_orders
  FROM tmp_requested_order_ids;

  IF v_requested_orders = 0 THEN
    RAISE EXCEPTION 'void_received_orders_by_ids: at least one order_id is required';
  END IF;

  CREATE TEMP TABLE tmp_received_orders_to_void ON COMMIT DROP AS
  SELECT o.order_id, o.cashier_id, o.total_amount
  FROM public.orders o
  JOIN tmp_requested_order_ids r ON r.order_id = o.order_id
  WHERE o.status = 'received';

  IF (SELECT COUNT(*) FROM tmp_received_orders_to_void) <> v_requested_orders THEN
    RAISE EXCEPTION 'void_received_orders_by_ids: one or more receipts were not found or are no longer received';
  END IF;

  SELECT coalesce(SUM(total_amount), 0)::double precision
  INTO v_voided_sales_amount
  FROM tmp_received_orders_to_void;

  PERFORM 1
  FROM public.orders o
  JOIN tmp_received_orders_to_void d ON d.order_id = o.order_id
  ORDER BY o.order_id
  FOR UPDATE OF o;

  CREATE TEMP TABLE tmp_inventory_reversals ON COMMIT DROP AS
  SELECT
    it.reference_id AS order_id,
    o.cashier_id,
    it.ingredient_id,
    SUM(-it.quantity_change)::double precision AS quantity_restore
  FROM public.inventory_transactions it
  JOIN tmp_received_orders_to_void o ON o.order_id = it.reference_id
  WHERE it.transaction_type = 'sale'
    AND it.quantity_change < 0
  GROUP BY it.reference_id, o.cashier_id, it.ingredient_id;

  PERFORM 1
  FROM public.inventory i
  JOIN tmp_inventory_reversals r ON r.ingredient_id = i.ingredient_id
  ORDER BY i.ingredient_id
  FOR UPDATE OF i;

  UPDATE public.inventory i
  SET current_quantity = i.current_quantity + r.quantity_restore
  FROM (
    SELECT ingredient_id, SUM(quantity_restore)::double precision AS quantity_restore
    FROM tmp_inventory_reversals
    GROUP BY ingredient_id
  ) r
  WHERE r.ingredient_id = i.ingredient_id;

  INSERT INTO public.inventory_transactions (
    ingredient_id,
    quantity_change,
    transaction_type,
    reference_id,
    reason,
    cashier_id
  )
  SELECT
    r.ingredient_id,
    r.quantity_restore,
    'void',
    r.order_id,
    format('Void received order %s: restore sale deduction', r.order_id),
    r.cashier_id
  FROM tmp_inventory_reversals r
  WHERE r.quantity_restore > 0;

  GET DIAGNOSTICS v_restored_transactions = ROW_COUNT;

  UPDATE public.orders o
  SET
    status = 'voided',
    voided_at = now(),
    void_reason = 'Voided from specific receipt selection'
  FROM tmp_received_orders_to_void d
  WHERE d.order_id = o.order_id
    AND o.status = 'received';

  GET DIAGNOSTICS v_voided_orders = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_payments', 0,
    'deleted_order_items', 0,
    'deleted_orders', 0,
    'voided_orders', v_voided_orders,
    'voided_sales_amount', v_voided_sales_amount,
    'restored_inventory_transactions', v_restored_transactions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.void_received_orders_by_ids(bigint[], text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_received_orders_by_ids(bigint[], text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_received_orders_by_ids(
  p_order_ids bigint[],
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
  v_requested_orders bigint := 0;
  v_deleted_orders bigint := 0;
  v_deleted_order_items bigint := 0;
  v_deleted_payments bigint := 0;
  v_deleted_sales_amount double precision := 0;
  v_restored_transactions bigint := 0;
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'delete_received_orders_by_ids: not authorized (admin role required)';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'delete_received_orders_by_ids: at least one order_id is required';
  END IF;

  IF lower(trim(coalesce(p_confirm_email, ''))) <> lower(coalesce(auth.jwt() ->> 'email', '')) THEN
    RAISE EXCEPTION 'delete_received_orders_by_ids: account email confirmation did not match';
  END IF;

  IF trim(coalesce(p_confirm_action, '')) <> 'DELETE RECEIPTS' THEN
    RAISE EXCEPTION 'delete_received_orders_by_ids: first confirmation phrase did not match';
  END IF;

  IF trim(coalesce(p_confirm_scope, '')) <> 'DELETE SELECTED RECEIPTS' THEN
    RAISE EXCEPTION 'delete_received_orders_by_ids: second confirmation phrase did not match';
  END IF;

  DROP TABLE IF EXISTS tmp_requested_order_ids;
  DROP TABLE IF EXISTS tmp_received_orders_to_delete;
  DROP TABLE IF EXISTS tmp_inventory_reversals;

  CREATE TEMP TABLE tmp_requested_order_ids ON COMMIT DROP AS
  SELECT DISTINCT unnest(p_order_ids)::bigint AS order_id;

  SELECT COUNT(*) INTO v_requested_orders
  FROM tmp_requested_order_ids;

  IF v_requested_orders = 0 THEN
    RAISE EXCEPTION 'delete_received_orders_by_ids: at least one order_id is required';
  END IF;

  CREATE TEMP TABLE tmp_received_orders_to_delete ON COMMIT DROP AS
  SELECT o.order_id, o.cashier_id, o.total_amount
  FROM public.orders o
  JOIN tmp_requested_order_ids r ON r.order_id = o.order_id
  WHERE o.status = 'received';

  IF (SELECT COUNT(*) FROM tmp_received_orders_to_delete) <> v_requested_orders THEN
    RAISE EXCEPTION 'delete_received_orders_by_ids: one or more receipts were not found or are no longer received';
  END IF;

  SELECT coalesce(SUM(total_amount), 0)::double precision
  INTO v_deleted_sales_amount
  FROM tmp_received_orders_to_delete;

  PERFORM 1
  FROM public.orders o
  JOIN tmp_received_orders_to_delete d ON d.order_id = o.order_id
  ORDER BY o.order_id
  FOR UPDATE OF o;

  CREATE TEMP TABLE tmp_inventory_reversals ON COMMIT DROP AS
  SELECT
    it.reference_id AS order_id,
    o.cashier_id,
    it.ingredient_id,
    SUM(-it.quantity_change)::double precision AS quantity_restore
  FROM public.inventory_transactions it
  JOIN tmp_received_orders_to_delete o ON o.order_id = it.reference_id
  WHERE it.transaction_type = 'sale'
    AND it.quantity_change < 0
  GROUP BY it.reference_id, o.cashier_id, it.ingredient_id;

  PERFORM 1
  FROM public.inventory i
  JOIN tmp_inventory_reversals r ON r.ingredient_id = i.ingredient_id
  ORDER BY i.ingredient_id
  FOR UPDATE OF i;

  UPDATE public.inventory i
  SET current_quantity = i.current_quantity + r.quantity_restore
  FROM (
    SELECT ingredient_id, SUM(quantity_restore)::double precision AS quantity_restore
    FROM tmp_inventory_reversals
    GROUP BY ingredient_id
  ) r
  WHERE r.ingredient_id = i.ingredient_id;

  INSERT INTO public.inventory_transactions (
    ingredient_id,
    quantity_change,
    transaction_type,
    reference_id,
    reason,
    cashier_id
  )
  SELECT
    r.ingredient_id,
    r.quantity_restore,
    'delete',
    r.order_id,
    format('Delete received order %s: restore sale deduction', r.order_id),
    r.cashier_id
  FROM tmp_inventory_reversals r
  WHERE r.quantity_restore > 0;

  GET DIAGNOSTICS v_restored_transactions = ROW_COUNT;

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
    'deleted_orders', v_deleted_orders,
    'voided_orders', 0,
    'deleted_sales_amount', v_deleted_sales_amount,
    'restored_inventory_transactions', v_restored_transactions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_received_orders_by_ids(bigint[], text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_received_orders_by_ids(bigint[], text, text, text) TO authenticated;
