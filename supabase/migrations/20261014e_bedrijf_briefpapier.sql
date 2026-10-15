-- Briefpapier voor rapporten naar de klant (opleverrapport, meerwerkoverzicht), in te stellen bij
-- Instellingen → Bedrijfsgegevens → Huisstijl. Per werkmaatschappij; zonder eigen briefpapier valt
-- een werkmaatschappij terug op dat van de organisatie.
--
-- Tot nu toe zochten deze rapporten het briefpapier in de offerte-lay-outs, maar daar staat er geen
-- (de offerte zelf komt uit Word en heeft het briefpapier in het sjabloon). Daardoor kwamen ze
-- zonder briefpapier uit.

alter table public.bedrijfsgegevens
  add column if not exists briefpapier_pdf_url text;

comment on column public.bedrijfsgegevens.briefpapier_pdf_url is
  'Briefpapier-PDF onder rapporten naar de klant; werkmaatschappij zonder eigen briefpapier gebruikt dat van de organisatie.';

-- Startwaarde: het groene Everts-briefpapier dat al in de opslag staat, op de organisatie.
update public.bedrijfsgegevens
   set briefpapier_pdf_url = 'https://bbfcupdnjcymdrogjmug.supabase.co/storage/v1/object/public/docx-templates/briefpapier/afa58e07-f378-4a85-8b9f-c6d44d451511/1783971386883-Briefpapier.pdf'
 where type = 'organisatie' and briefpapier_pdf_url is null;
