-- Cozy Cafe Menu: include optional size_label in menu/order read RPCs.

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
        'size_label', m.size_label,
        'description', m.description,
        'price', m.price,
        'category', m.category
      )
      ORDER BY m.category, m.name, m.size_label
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
        'size_label', m.size_label,
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
        'size_label', m.size_label,
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
