-- The Cozzy Cup Cafe Menu: optional product size / variant label.
-- Use this for sizes like 12oz, 16oz, 190ml, 290ml instead of making size categories.

ALTER TABLE public.menu
  ADD COLUMN IF NOT EXISTS size_label text;

CREATE INDEX IF NOT EXISTS menu_category_size_name_idx
  ON public.menu (category, size_label, name);
