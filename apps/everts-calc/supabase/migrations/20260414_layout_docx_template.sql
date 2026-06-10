-- Voegt docx_template_url toe aan quote_layouts
-- Bevat de URL naar een .docx template in Supabase Storage (bucket: docx-templates)
-- Staat naast html_template/wysiwyg_body — beide benaderingen kunnen per layout bestaan

ALTER TABLE quote_layouts
  ADD COLUMN IF NOT EXISTS docx_template_url text;

-- Maak ook de storage bucket aan via Supabase Dashboard:
-- Storage → New bucket → naam: "docx-templates" → Public: true
