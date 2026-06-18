-- The Cozzy Cup Cafe Menu: include optional size_label in the public menu RPC.
--
-- Queue and received-order RPCs now live in:
-- supabase/migrations/20250515161000_one_copy_app_repair.sql

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

DO $$
BEGIN
  RAISE NOTICE '20250515152000 only updates get_menu_public. Run 20250515161000_one_copy_app_repair.sql for queue and received-order RPCs.';
END;
$$;
