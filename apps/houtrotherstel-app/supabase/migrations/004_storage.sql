-- ============================================================
-- SUPABASE STORAGE CONFIGURATIE
-- Buckets zijn project-breed (niet schema-specifiek).
-- Bucket-namen zijn uniek gekozen om conflicten te vermijden.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'htr-repair-photos',
  'htr-repair-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "htr_repair_photos_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'htr-repair-photos' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "htr_repair_photos_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'htr-repair-photos' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "htr_repair_photos_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'htr-repair-photos' AND
  (
    auth.uid()::text = (storage.foldername(name))[1] OR
    EXISTS (
      SELECT 1 FROM houtrotherstel.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'htr-project-documents',
  'htr-project-documents',
  false,
  52428800
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "htr_project_docs_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'htr-project-documents' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "htr_project_docs_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'htr-project-documents' AND
  EXISTS (
    SELECT 1 FROM houtrotherstel.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'projectleider')
  )
);

CREATE POLICY "htr_project_docs_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'htr-project-documents' AND
  EXISTS (
    SELECT 1 FROM houtrotherstel.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
