-- Cozy Cafe Inventory: optional classification for ingredient grouping.

ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS classification text;
