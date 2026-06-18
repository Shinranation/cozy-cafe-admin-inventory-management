-- The Cozzy Cup Cafe POS: schema fixes, menu↔inventory link, order_items→orders, RPCs for confirm + received.
-- Run in Supabase SQL Editor (or supabase db push) once. Review TRUNCATE blocks if you already have production data.

-- =============================================================================
-- 0) Preconditions / cleanup (dev-friendly: remove orphan line items)
-- =============================================================================
-- order_items had no order_id in the original ERD; existing rows cannot be attached safely.
TRUNCATE TABLE public.order_items RESTART IDENTITY CASCADE;

-- =============================================================================
-- 1) cashier: remove impossible self-FK on PK (IDENTITY rows cannot reference themselves on INSERT)
-- =============================================================================
ALTER TABLE public.cashier
  DROP CONSTRAINT IF EXISTS cashier_cashier_id_fkey;

-- Optional hierarchy (unused until you need it):
-- ALTER TABLE public.cashier ADD COLUMN IF NOT EXISTS supervisor_id bigint REFERENCES public.cashier(cashier_id);

-- =============================================================================
-- 2) orders: widen IDs to bigint, optional guest name for queue UI, status default
-- =============================================================================
ALTER TABLE public.orders
  ALTER COLUMN cashier_id TYPE bigint USING cashier_id::bigint;

ALTER TABLE public.orders
  ALTER COLUMN client_id TYPE bigint USING client_id::bigint;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_display_name text;

ALTER TABLE public.orders
  ALTER COLUMN status SET DEFAULT 'pending';

UPDATE public.orders SET status = 'pending' WHERE status IS NULL OR trim(status) = '';

-- Normalize any legacy status values before adding the CHECK constraint.
UPDATE public.orders
SET status = 'pending'
WHERE status IS NOT NULL AND status NOT IN ('pending', 'received');

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'received'));

-- FKs (add only if not present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_cashier_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.cashier(cashier_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_client_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(client_id);
  END IF;
END $$;

-- =============================================================================
-- 3) order_items: FK to orders + menu, bigint menu_item_id
-- =============================================================================
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS order_id bigint;

ALTER TABLE public.order_items
  ALTER COLUMN menu_item_id TYPE bigint USING menu_item_id::bigint,
  ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN unit_price SET NOT NULL,
  ALTER COLUMN sub_total SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_menu_item_id_fkey') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_menu_item_id_fkey
      FOREIGN KEY (menu_item_id) REFERENCES public.menu(item_id);
  END IF;
END $$;

ALTER TABLE public.order_items
  ALTER COLUMN order_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);

-- =============================================================================
-- 4) menu: each sellable row points at exactly one inventory row (1:1 “servings on hand”)
-- =============================================================================
ALTER TABLE public.menu
  ADD COLUMN IF NOT EXISTS inventory_ingredient_id bigint REFERENCES public.inventory(ingredient_id);

CREATE UNIQUE INDEX IF NOT EXISTS menu_one_inventory_row_uq
  ON public.menu (inventory_ingredient_id)
  WHERE inventory_ingredient_id IS NOT NULL;

-- =============================================================================
-- 5) View: menu-first availability (use from Inventory UI instead of raw ingredient_id focus)
-- =============================================================================
CREATE OR REPLACE VIEW public.menu_inventory AS
SELECT
  m.item_id,
  m.name AS menu_name,
  m.category,
  m.price,
  m.description,
  m.availability_status,
  m.inventory_ingredient_id,
  i.name AS inventory_row_name,
  i.current_quantity AS available_units,
  i.unit_of_measure,
  i.low_stock
FROM public.menu m
LEFT JOIN public.inventory i ON i.ingredient_id = m.inventory_ingredient_id;

-- =============================================================================
-- 6) Seed: default cashier + inventory + menu (matches demo categories/items in NewOrder.jsx)
--    Idempotent: skips rows that already exist (matched by inventory.name / menu.name).
-- =============================================================================
INSERT INTO public.cashier (full_name, role, login_credentials)
SELECT 'Default Cashier', 'staff', 'default-local'
WHERE NOT EXISTS (SELECT 1 FROM public.cashier LIMIT 1);

-- Inventory rows (one per menu sellable = “how many can we sell”)
INSERT INTO public.inventory (name, current_quantity, unit_of_measure, low_stock)
SELECT v.name, v.current_quantity, v.unit_of_measure, v.low_stock
FROM (
  VALUES
    ('Chicken Teriraki Bowl (servings)', 100::double precision, 'serving', 5::double precision),
    ('Classic French Fries (servings)', 100::double precision, 'serving', 5::double precision),
    ('Waffle Maple Cinnamon (servings)', 100::double precision, 'serving', 5::double precision),
    ('Coke (servings)', 100::double precision, 'serving', 5::double precision),
    ('Bibimbap Beef (servings)', 100::double precision, 'serving', 5::double precision),
    ('Tuna Cheese Toast (servings)', 100::double precision, 'serving', 5::double precision),
    ('Beef Tapa (servings)', 100::double precision, 'serving', 5::double precision),
    ('Carbonara (servings)', 100::double precision, 'serving', 5::double precision)
) AS v(name, current_quantity, unit_of_measure, low_stock)
WHERE NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.name = v.name);

INSERT INTO public.menu (name, description, price, category, availability_status, inventory_ingredient_id)
SELECT v.name, v.description, v.price, v.category, 'available', inv.ingredient_id
FROM (VALUES
  ('Chicken Teriraki Bowl', 'Rice bowl with teriyaki chicken', 99::double precision, 'Rice Bowl Chicken Wings'),
  ('Classic French Fries', 'Crispy fries', 85::double precision, 'French Fries'),
  ('Waffle Maple Cinnamon', 'Sweet waffle', 89::double precision, 'Waffles'),
  ('Coke', 'Soft drink', 25::double precision, 'Soft Drinks'),
  ('Bibimbap (Beef)', 'Korean rice bowl', 139::double precision, 'Korean Rice Bowls'),
  ('Tuna Cheese Toast', 'Sandwich', 99::double precision, 'Sandwiches'),
  ('Beef Tapa', 'Silog bowl', 99::double precision, 'Silog Bowls'),
  ('Carbonara', 'Pasta', 159::double precision, 'Others')
) AS v(name, description, price, category)
JOIN public.inventory inv ON inv.name = (
  CASE v.name
    WHEN 'Chicken Teriraki Bowl' THEN 'Chicken Teriraki Bowl (servings)'
    WHEN 'Classic French Fries' THEN 'Classic French Fries (servings)'
    WHEN 'Waffle Maple Cinnamon' THEN 'Waffle Maple Cinnamon (servings)'
    WHEN 'Coke' THEN 'Coke (servings)'
    WHEN 'Bibimbap (Beef)' THEN 'Bibimbap Beef (servings)'
    WHEN 'Tuna Cheese Toast' THEN 'Tuna Cheese Toast (servings)'
    WHEN 'Beef Tapa' THEN 'Beef Tapa (servings)'
    WHEN 'Carbonara' THEN 'Carbonara (servings)'
  END
)
WHERE NOT EXISTS (SELECT 1 FROM public.menu m0 WHERE m0.name = v.name);

-- If menu already has rows but inventory_ingredient_id is null, link by name (idempotent touch-up):
UPDATE public.menu m
SET inventory_ingredient_id = i.ingredient_id
FROM public.inventory i
WHERE m.inventory_ingredient_id IS NULL
  AND i.name = (
    CASE m.name
      WHEN 'Chicken Teriraki Bowl' THEN 'Chicken Teriraki Bowl (servings)'
      WHEN 'Classic French Fries' THEN 'Classic French Fries (servings)'
      WHEN 'Waffle Maple Cinnamon' THEN 'Waffle Maple Cinnamon (servings)'
      WHEN 'Coke' THEN 'Coke (servings)'
      WHEN 'Bibimbap (Beef)' THEN 'Bibimbap Beef (servings)'
      WHEN 'Tuna Cheese Toast' THEN 'Tuna Cheese Toast (servings)'
      WHEN 'Beef Tapa' THEN 'Beef Tapa (servings)'
      WHEN 'Carbonara' THEN 'Carbonara (servings)'
      ELSE NULL
    END
  );

-- =============================================================================
-- 7) Authorization helper: admin from public.user_roles (matches your app)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_admin_app_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_app_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_app_user() TO authenticated;

-- =============================================================================
-- 8) RPC: confirm_pos_order — validates stock, inserts order + lines, decrements inventory, logs tx
--    Lines shape: [{"menu_item_id": <bigint>, "quantity": <int>}, ...]
-- =============================================================================
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

  -- Aggregate duplicate menu lines and validate menu + inventory mapping
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
    JOIN public.menu m ON m.item_id = t.menu_item_id
    WHERE m.inventory_ingredient_id IS NULL
  ) THEN
    RAISE EXCEPTION 'confirm_pos_order: one or more menu items are not linked to inventory (inventory_ingredient_id is null)';
  END IF;

  -- Lock inventory rows in stable order, then check stock
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
    JOIN public.inventory i ON i.ingredient_id = m.inventory_ingredient_id
    ORDER BY m.inventory_ingredient_id
    FOR UPDATE OF i
  LOOP
    IF rec_agg.current_quantity < rec_agg.need_qty THEN
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
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_pos_order(bigint, bigint, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_pos_order(bigint, bigint, text, jsonb) TO authenticated;

-- =============================================================================
-- 9) RPC: mark_order_received — moves queue entry to “received” for your Received page/filter
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_order_received(p_order_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'mark_order_received: not authorized (admin role required)';
  END IF;

  UPDATE public.orders o
  SET status = 'received'
  WHERE o.order_id = p_order_id
    AND o.status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_order_received: order % not found or not pending', p_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_received(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_received(bigint) TO authenticated;

-- =============================================================================
-- 10) Optional read helper: pending orders with line detail (for Queue UI)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.list_pending_orders_with_items()
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
    RAISE EXCEPTION 'list_pending_orders_with_items: not authorized (admin role required)';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_id', o.order_id,
        'created_at', o.created_at,
        'cashier_id', o.cashier_id,
        'client_id', o.client_id,
        'total_amount', o.total_amount,
        'status', o.status,
        'guest_display_name', o.guest_display_name,
        'customer_display', coalesce(cl.full_name, o.guest_display_name, 'Guest'),
        'items', coalesce(li.items, '[]'::jsonb)
      )
      ORDER BY o.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.orders o
  LEFT JOIN public.clients cl ON cl.client_id = o.client_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'menu_item_id', oi.menu_item_id,
        'name', m.name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'sub_total', oi.sub_total
      )
      ORDER BY oi.order_item_id
    ) AS items
    FROM public.order_items oi
    JOIN public.menu m ON m.item_id = oi.menu_item_id
    WHERE oi.order_id = o.order_id
  ) li ON true
  WHERE o.status = 'pending';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_pending_orders_with_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_orders_with_items() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_received_orders_with_items()
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
    RAISE EXCEPTION 'list_received_orders_with_items: not authorized (admin role required)';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_id', o.order_id,
        'created_at', o.created_at,
        'cashier_id', o.cashier_id,
        'client_id', o.client_id,
        'total_amount', o.total_amount,
        'status', o.status,
        'guest_display_name', o.guest_display_name,
        'customer_display', coalesce(cl.full_name, o.guest_display_name, 'Guest'),
        'items', coalesce(li.items, '[]'::jsonb)
      )
      ORDER BY o.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.orders o
  LEFT JOIN public.clients cl ON cl.client_id = o.client_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'menu_item_id', oi.menu_item_id,
        'name', m.name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'sub_total', oi.sub_total
      )
      ORDER BY oi.order_item_id
    ) AS items
    FROM public.order_items oi
    JOIN public.menu m ON m.item_id = oi.menu_item_id
    WHERE oi.order_id = o.order_id
  ) li ON true
  WHERE o.status = 'received';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_received_orders_with_items() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_received_orders_with_items() TO authenticated;

-- =============================================================================
-- 11) Read helper: menu + on-hand units (for New Order / validation on the client)
-- =============================================================================
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
  JOIN public.inventory i ON i.ingredient_id = m.inventory_ingredient_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_menu_for_pos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_menu_for_pos() TO authenticated;
