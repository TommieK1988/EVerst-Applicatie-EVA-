-- Briefpapier-achtergrond per offerte-layout.
-- Een geüploade PDF wordt als achtergrond onder elke content-pagina van de
-- offerte gelegd (zowel in de preview als in de gedownloade eind-PDF).

alter table public.quote_layouts
  add column if not exists briefpapier_pdf_url text;

comment on column public.quote_layouts.briefpapier_pdf_url is
  'Publieke URL naar een briefpapier-PDF die als achtergrond onder elke offerte-pagina wordt gelegd (per layout).';
