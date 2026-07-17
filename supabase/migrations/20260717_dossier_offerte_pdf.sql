-- Handmatig gekoppelde offerte-PDF op het dossier (Informatie-tab, fase Offerte).
-- Het bestand zelf staat in de private storage-bucket 'dossier-offertes';
-- inzien loopt via kortstondige signed URLs (zie lib/dossiers/offerte-paneel-actions.ts).
alter table public.dossiers
  add column if not exists offerte_pdf_pad  text,
  add column if not exists offerte_pdf_naam text;

comment on column public.dossiers.offerte_pdf_pad  is 'Storage-pad van de handmatig gekoppelde offerte-PDF in bucket dossier-offertes';
comment on column public.dossiers.offerte_pdf_naam is 'Oorspronkelijke bestandsnaam van de gekoppelde offerte-PDF';
