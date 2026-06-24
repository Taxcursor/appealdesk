-- ============================================================
-- AppealDesk — Storage Buckets Setup
-- Run this in Supabase SQL Editor after schema.sql
-- ============================================================

-- Bucket for all organization files (logos + compliance docs + event/proceeding attachments)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-files',
  'org-files',
  true,
  10485760, -- 10MB max
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for appeal documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'appeal-documents',
  'appeal-documents',
  false,
  10485760, -- 10MB max
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for templates
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'templates',
  'templates',
  false,
  10485760, -- 10MB max
  ARRAY['application/pdf', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: org-files (public read, authenticated upload)
CREATE POLICY "org_files_select" ON storage.objects FOR SELECT USING (bucket_id = 'org-files');
CREATE POLICY "org_files_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'org-files' AND auth.role() = 'authenticated'
);
CREATE POLICY "org_files_update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'org-files' AND auth.role() = 'authenticated'
);

-- Storage policies: appeal-documents (authenticated only)
CREATE POLICY "appeal_docs_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'appeal-documents' AND auth.role() = 'authenticated'
);
CREATE POLICY "appeal_docs_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'appeal-documents' AND auth.role() = 'authenticated'
);

-- Storage policies: templates (authenticated only)
CREATE POLICY "templates_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'templates' AND auth.role() = 'authenticated'
);
CREATE POLICY "templates_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'templates' AND auth.role() = 'authenticated'
);
CREATE POLICY "templates_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'templates' AND auth.role() = 'authenticated'
);
