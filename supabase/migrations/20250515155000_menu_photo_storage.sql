-- The Cozzy Cup Cafe Menu: public storage bucket for menu item photos.

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-photos', 'menu-photos', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

DROP POLICY IF EXISTS "menu_photos_public_read" ON storage.objects;
CREATE POLICY "menu_photos_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'menu-photos');

DROP POLICY IF EXISTS "menu_photos_admin_insert" ON storage.objects;
CREATE POLICY "menu_photos_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-photos'
);

DROP POLICY IF EXISTS "menu_photos_admin_update" ON storage.objects;
CREATE POLICY "menu_photos_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'menu-photos'
)
WITH CHECK (
  bucket_id = 'menu-photos'
);

DROP POLICY IF EXISTS "menu_photos_admin_delete" ON storage.objects;
CREATE POLICY "menu_photos_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'menu-photos'
);
