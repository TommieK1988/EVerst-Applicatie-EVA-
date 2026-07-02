-- Herkomst van een meerwerkregel + dedupe-sleutel voor import uit Bouw7.
--
-- Bestaand Bouw7-meerwerk (geboekt per bewakingscode of als meerwerk-offerteregel) kan als
-- bewerkbare EVA-regel geïmporteerd worden. `bron` legt de herkomst vast; `bouw7_bron_sleutel`
-- voorkomt dubbele import (partial unique index per dossier).

alter table public.meerwerk_regels
  add column if not exists bron text not null default 'eva',
  add column if not exists bouw7_bron_sleutel text;

do $$ begin
  alter table public.meerwerk_regels
    add constraint meerwerk_regels_bron_check
    check (bron in ('eva','bouw7_code','bouw7_offerte'));
exception when duplicate_object then null; end $$;

create unique index if not exists uq_meerwerk_regels_bron_sleutel
  on public.meerwerk_regels (dossier_id, bouw7_bron_sleutel)
  where bouw7_bron_sleutel is not null;

comment on column public.meerwerk_regels.bron is
  'Herkomst: eva (handmatig), bouw7_code (geboekt meerwerk per bewakingscode), bouw7_offerte (meerwerk-offerteregel).';
comment on column public.meerwerk_regels.bouw7_bron_sleutel is
  'Stabiele bronsleutel voor import uit Bouw7 (code:<code> of offerte:<quotationId>:<lineId>); uniek per dossier, voorkomt dubbele import.';
