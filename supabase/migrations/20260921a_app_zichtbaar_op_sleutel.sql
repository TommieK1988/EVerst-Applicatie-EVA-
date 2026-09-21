-- App-zichtbaarheid van dossierbestanden op de bronoverstijgende sleutel i.p.v. het Bouw7-id.
-- Toegepast op 2026-09-21 via de Supabase MCP.
--
-- De tabel was gebouwd toen de Bestanden-tab alleen Bouw7 kende: de sleutel was het
-- Bouw7-bestand-id, en een SharePoint-bestand paste er dus niet in. In de lijst stond
-- bij die bestanden een streepje in de kolom "In app". Inmiddels bewaren collega's het
-- meeste in de SharePoint-dossiermap, dus dat streepje sloeg juist de bestanden over
-- die de buitendienst nodig heeft.
--
-- `sleutel` is exact dezelfde tekst als `BestandRij.sleutel` in
-- lib/dossiers/bestand-rijen.ts (`bouw7:<id>` / `sharepoint:<itemId>`) en als de sleutel
-- in `portaal_bestanden`. Eén schrijfwijze voor beide vinkjes.
alter table public.dossier_bestand_app_zichtbaar
  add column if not exists sleutel text;

update public.dossier_bestand_app_zichtbaar
   set sleutel = 'bouw7:' || bouw7_bestand_id
 where sleutel is null
   and bouw7_bestand_id is not null;

alter table public.dossier_bestand_app_zichtbaar
  alter column sleutel set not null;

alter table public.dossier_bestand_app_zichtbaar
  drop constraint if exists dossier_bestand_app_zichtbaar_pkey;

alter table public.dossier_bestand_app_zichtbaar
  alter column bouw7_bestand_id drop not null;

alter table public.dossier_bestand_app_zichtbaar
  add constraint dossier_bestand_app_zichtbaar_pkey primary key (dossier_id, sleutel);

-- `bouw7_bestand_id` blijft staan mét een eigen unieke index, want tussen deze migratie
-- en de Vercel-deploy draait de oude build nog: die upsert op (dossier_id, bouw7_bestand_id)
-- en zou zonder die index meteen omvallen. De kolom mag weg zodra die build weg is.
-- Postgres ziet NULL-waarden als onderling verschillend, dus SharePoint-rijen (waar de
-- kolom leeg blijft) botsen hier niet op elkaar.
create unique index if not exists uq_dossier_bestand_app_zichtbaar_bouw7
  on public.dossier_bestand_app_zichtbaar(dossier_id, bouw7_bestand_id);

comment on table public.dossier_bestand_app_zichtbaar is
  'Opt-in: welke dossierbestanden (Bouw7 én SharePoint) zichtbaar zijn in de mobiele app. Geen rij = niet zichtbaar.';

comment on column public.dossier_bestand_app_zichtbaar.sleutel is
  'Bronoverstijgende sleutel, gelijk aan BestandRij.sleutel: bouw7:<id> of sharepoint:<itemId>.';

comment on column public.dossier_bestand_app_zichtbaar.bouw7_bestand_id is
  'Verouderd; alleen gevuld voor Bouw7-bestanden zodat de vorige build kan blijven draaien. Gebruik sleutel.';
