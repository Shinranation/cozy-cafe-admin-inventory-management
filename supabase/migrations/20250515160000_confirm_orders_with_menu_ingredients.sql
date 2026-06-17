-- Confirm orders using menu_ingredients as the recipe bridge:
-- menu -> menu_ingredients -> inventory.
-- This keeps menu items, raw ingredients, and orders separated.

ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

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
  rec_line record;
  rec_stock record;
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

  IF EXISTS (
    SELECT 1
    FROM tmp_order_lines t
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.menu_ingredients mi
      WHERE mi.menu_item_id = t.menu_item_id
    )
  ) THEN
    RAISE EXCEPTION 'NO_RECIPE: one or more menu items have no linked ingredients';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_order_lines t
    JOIN public.menu_ingredients mi ON mi.menu_item_id = t.menu_item_id
    JOIN public.inventory i ON i.ingredient_id = mi.ingredient_id
    WHERE i.is_active = false
  ) THEN
    RAISE EXCEPTION 'ARCHIVED_INGREDIENT: one or more menu recipes use archived ingredients';
  END IF;

  SELECT SUM(m.price * t.quantity)
  INTO v_total
  FROM tmp_order_lines t
  JOIN public.menu m ON m.item_id = t.menu_item_id;

  FOR rec_stock IN
    SELECT
      i.ingredient_id,
      i.name,
      i.current_quantity,
      SUM(t.quantity * mi.quantity_required)::double precision AS required_quantity
    FROM tmp_order_lines t
    JOIN public.menu_ingredients mi ON mi.menu_item_id = t.menu_item_id
    JOIN public.inventory i ON i.ingredient_id = mi.ingredient_id
    WHERE i.is_active = true
    GROUP BY i.ingredient_id, i.name, i.current_quantity
    ORDER BY i.ingredient_id
  LOOP
    IF rec_stock.current_quantity < rec_stock.required_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: % — required %, available %. Add stock or lower quantity.',
        rec_stock.name,
        rec_stock.required_quantity,
        rec_stock.current_quantity;
    END IF;
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

  FOR rec_line IN
    SELECT
      t.menu_item_id,
      t.quantity,
      m.price
    FROM tmp_order_lines t
    JOIN public.menu m ON m.item_id = t.menu_item_id
  LOOP
    INSERT INTO public.order_items (order_id, menu_item_id, quantity, unit_price, sub_total)
    VALUES (
      v_order_id,
      rec_line.menu_item_id,
      rec_line.quantity,
      rec_line.price,
      rec_line.price * rec_line.quantity
    );
  END LOOP;

  FOR rec_stock IN
    SELECT
      i.ingredient_id,
      i.name,
      SUM(t.quantity * mi.quantity_required)::double precision AS required_quantity
    FROM tmp_order_lines t
    JOIN public.menu_ingredients mi ON mi.menu_item_id = t.menu_item_id
    JOIN public.inventory i ON i.ingredient_id = mi.ingredient_id
    WHERE i.is_active = true
    GROUP BY i.ingredient_id, i.name
    ORDER BY i.ingredient_id
  LOOP
    UPDATE public.inventory i
    SET current_quantity = i.current_quantity - rec_stock.required_quantity
    WHERE i.ingredient_id = rec_stock.ingredient_id;

    INSERT INTO public.inventory_transactions (
      ingredient_id,
      quantity_change,
      transaction_type,
      reference_id,
      reason,
      cashier_id
    )
    VALUES (
      rec_stock.ingredient_id,
      -rec_stock.required_quantity,
      'sale',
      v_order_id,
      format('POS order %s ingredient deduction: %s', v_order_id, rec_stock.name),
      p_cashier_id
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pos_order(bigint, bigint, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pos_order(bigint, bigint, text, jsonb) TO authenticated;
