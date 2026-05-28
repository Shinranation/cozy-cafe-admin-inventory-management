-- Cozy Cafe Menu: optional image URL for customer-facing menu item photos.

ALTER TABLE public.menu
ADD COLUMN IF NOT EXISTS image_url text;

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
        'category', m.category,
        'image_url', m.image_url,
        'availability_status', m.availability_status
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
