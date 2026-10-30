-- Run after setup.sql in the DEMO project. All test writes are rolled back.
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_item bigint;
  v_order bigint;
  v_before double precision;
  v_after double precision;
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'Anonymous admin check failed';
  END IF;
  PERFORM * FROM public.activity_logs LIMIT 1;
  PERFORM * FROM public.audit_logs LIMIT 1;
  PERFORM * FROM public.list_pending_orders_with_items();
  PERFORM * FROM public.list_received_orders_with_items();
  PERFORM * FROM public.list_sold_items_report(now() - interval '30 days', now());
  SELECT item_id INTO STRICT v_item FROM public.menu WHERE name = 'Cafe Latte';
  SELECT current_quantity INTO v_before FROM public.inventory WHERE name = 'Milk';
  v_order := public.confirm_pos_order(1, NULL, 'Permission test',
    jsonb_build_array(jsonb_build_object('menu_item_id', v_item, 'quantity', 1)));
  PERFORM public.mark_order_received(v_order);
  SELECT current_quantity INTO v_after FROM public.inventory WHERE name = 'Milk';
  IF v_after <> v_before - 180 THEN
    RAISE EXCEPTION 'Recipe deduction failed: before %, after %', v_before, v_after;
  END IF;
  UPDATE public.menu SET price = price + 1 WHERE item_id = v_item;
  INSERT INTO public.expenses (expense_name, amount, category, cashier_id)
  VALUES ('Permission test', 1, 'General', 1);
  RAISE NOTICE 'Anonymous reads, edits, order creation, receipt, and stock deduction passed.';
END;
$$;
ROLLBACK;
