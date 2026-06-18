-- The Cozzy Cup Cafe Inventory: permanently delete already-archived ingredients/menu items.
-- This is intentionally limited to archived rows only.

CREATE OR REPLACE FUNCTION public.permanent_delete_archived_item(
  p_item_type text,
  p_item_id bigint,
  p_confirm text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_app_user() THEN
    RAISE EXCEPTION 'permanent_delete_archived_item: not authorized (admin role required)';
  END IF;

  IF trim(coalesce(p_confirm, '')) <> 'DELETE PERMANENTLY' THEN
    RAISE EXCEPTION 'permanent_delete_archived_item: confirmation phrase did not match';
  END IF;

  IF p_item_type = 'ingredient' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.inventory i
      WHERE i.ingredient_id = p_item_id
        AND i.is_active = false
    ) THEN
      RAISE EXCEPTION 'permanent_delete_archived_item: archived ingredient % not found', p_item_id;
    END IF;

    DELETE FROM public.menu_ingredients mi
    WHERE mi.ingredient_id = p_item_id;

    UPDATE public.menu m
    SET inventory_ingredient_id = NULL
    WHERE m.inventory_ingredient_id = p_item_id;

    DELETE FROM public.inventory_transactions it
    WHERE it.ingredient_id = p_item_id;

    DELETE FROM public.inventory i
    WHERE i.ingredient_id = p_item_id
      AND i.is_active = false;

    RETURN;
  END IF;

  IF p_item_type = 'menu' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.menu m
      WHERE m.item_id = p_item_id
        AND lower(coalesce(m.availability_status, '')) = 'unavailable'
    ) THEN
      RAISE EXCEPTION 'permanent_delete_archived_item: archived menu item % not found', p_item_id;
    END IF;

    DELETE FROM public.menu_ingredients mi
    WHERE mi.menu_item_id = p_item_id;

    DELETE FROM public.order_items oi
    WHERE oi.menu_item_id = p_item_id;

    DELETE FROM public.menu m
    WHERE m.item_id = p_item_id
      AND lower(coalesce(m.availability_status, '')) = 'unavailable';

    RETURN;
  END IF;

  RAISE EXCEPTION 'permanent_delete_archived_item: p_item_type must be ingredient or menu';
END;
$$;

REVOKE ALL ON FUNCTION public.permanent_delete_archived_item(text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.permanent_delete_archived_item(text, bigint, text) TO authenticated;
