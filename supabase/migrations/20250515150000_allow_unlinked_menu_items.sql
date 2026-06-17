-- Menu items may now exist without a direct inventory_ingredient_id.
-- These function updates keep public menu, POS menu, and order confirmation working
-- with menu-only rows while still decrementing inventory for linked rows.

CREATE OR REPLACE FUNCTION public.get_menu_public()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_id', m.item_id,
        'name', m.name,
        'description', m.description,
        'price', m.price,
        'category', m.category,
        'availability_status', m.availability_status
      )
      ORDER BY m.category, m.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.menu m
  WHERE lower(coalesce(m.availability_status, '')) = 'available';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_menu_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_public() TO anon;
GRANT EXECUTE ON FUNCTION public.get_menu_public() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_menu_for_pos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'get_menu_for_pos: not authorized (admin role required)';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_id', m.item_id,
        'name', m.name,
        'description', m.description,
        'price', m.price,
        'category', m.category,
        'availability_status', m.availability_status,
        'inventory_ingredient_id', m.inventory_ingredient_id,
        'available_units', i.current_quantity,
        'unit_of_measure', i.unit_of_measure,
        'low_stock', i.low_stock
      )
      ORDER BY m.category, m.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.menu m
  LEFT JOIN public.inventory i ON i.ingredient_id = m.inventory_ingredient_id
  WHERE lower(coalesce(m.availability_status, '')) = 'available';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_menu_for_pos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_for_pos() TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_pos_order(
  p_cashier_id bigint,
  p_client_id bigint,
  p_guest_display_name text,
  p_lines jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id bigint;
  v_total double precision := 0;
  rec_agg record;
  v_unit double precision;
  v_sub double precision;
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'confirm_pos_order: not authorized (admin role required)';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'confirm_pos_order: p_lines must be a non-empty JSON array';
  END IF;

  IF p_cashier_id IS NULL THEN
    RAISE EXCEPTION 'confirm_pos_order: p_cashier_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cashier c WHERE c.cashier_id = p_cashier_id) THEN
    RAISE EXCEPTION 'confirm_pos_order: cashier_id % not found', p_cashier_id;
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients cl WHERE cl.client_id = p_client_id) THEN
    RAISE EXCEPTION 'confirm_pos_order: client_id % not found', p_client_id;
  END IF;

  DROP TABLE IF EXISTS tmp_order_lines;

  CREATE TEMP TABLE tmp_order_lines ON COMMIT DROP AS
  WITH raw AS (
    SELECT
      (elem->>'menu_item_id')::bigint AS menu_item_id,
      (elem->>'quantity')::int AS quantity
    FROM jsonb_array_elements(p_lines) AS t(elem)
  ),
  cleaned AS (
    SELECT menu_item_id, quantity
    FROM raw
    WHERE menu_item_id IS NOT NULL AND quantity IS NOT NULL
  )
  SELECT menu_item_id, SUM(quantity)::int AS quantity
  FROM cleaned
  GROUP BY menu_item_id;

  IF EXISTS (SELECT 1 FROM tmp_order_lines WHERE quantity <= 0) THEN
    RAISE EXCEPTION 'confirm_pos_order: each quantity must be a positive integer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_order_lines t
    LEFT JOIN public.menu m ON m.item_id = t.menu_item_id
    WHERE m.item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'confirm_pos_order: unknown menu_item_id in cart';
  END IF;

  FOR rec_agg IN
    SELECT
      t.menu_item_id,
      t.quantity AS need_qty,
      m.name AS menu_name,
      m.price,
      m.inventory_ingredient_id AS inv_id,
      i.current_quantity
    FROM tmp_order_lines t
    JOIN public.menu m ON m.item_id = t.menu_item_id
    LEFT JOIN public.inventory i ON i.ingredient_id = m.inventory_ingredient_id
    ORDER BY m.inventory_ingredient_id NULLS LAST
  LOOP
    IF rec_agg.inv_id IS NOT NULL AND rec_agg.current_quantity < rec_agg.need_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: % — requested %, available %. Try a lower quantity.',
        rec_agg.menu_name,
        rec_agg.need_qty,
        floor(rec_agg.current_quantity);
    END IF;

    v_total := v_total + (rec_agg.price * rec_agg.need_qty);
  END LOOP;

  INSERT INTO public.orders (cashier_id, client_id, total_amount, status, guest_display_name)
  VALUES (
    p_cashier_id,
    p_client_id,
    v_total,
    'pending',
    NULLIF(trim(coalesce(p_guest_display_name, '')), '')
  )
  RETURNING order_id INTO v_order_id;

  FOR rec_agg IN
    SELECT
      t.menu_item_id,
      t.quantity AS need_qty,
      m.price,
      m.inventory_ingredient_id AS inv_id
    FROM tmp_order_lines t
    JOIN public.menu m ON m.item_id = t.menu_item_id
  LOOP
    v_unit := rec_agg.price;
    v_sub := v_unit * rec_agg.need_qty;

    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, sub_total)
    VALUES (v_order_id, rec_agg.menu_item_id, rec_agg.need_qty, v_unit, v_sub);

    IF rec_agg.inv_id IS NOT NULL THEN
      UPDATE public.inventory i
      SET current_quantity = i.current_quantity - rec_agg.need_qty
      WHERE i.ingredient_id = rec_agg.inv_id;

      INSERT INTO public.inventory_transactions (
        ingredient_id,
        quantity_change,
        transaction_type,
        reference_id,
        reason,
        cashier_id
      )
      VALUES (
        rec_agg.inv_id,
        -rec_agg.need_qty::double precision,
        'sale',
        v_order_id,
        format('POS order %s: menu_item_id %s qty %s', v_order_id, rec_agg.menu_item_id, rec_agg.need_qty),
        p_cashier_id
      );
    END IF;
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pos_order(bigint, bigint, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pos_order(bigint, bigint, text, jsonb) TO authenticated;
