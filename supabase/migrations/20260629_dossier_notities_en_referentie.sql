-- Notities-blok per dossier (Opdrachten + Servicedesk): getimestampte notities met auteur.
-- Vervangt het losse veld dossiers.interne_opmerkingen (die kolom wordt in een vervolg-
-- migratie gedropt nadat alle code-referenties verwijderd zijn).
create table if not exists public.dossier_notities (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references public.dossiers(id) on delete cascade,
  medewerker_id uuid references public.medewerkers(id) on delete set null,
  inhoud        text not null,
  created_at    timestamptz not null default now()
);

create index if not exists dossier_notities_dossier_created_idx
  on public.dossier_notities (dossier_id, created_at desc);

-- RLS aan, geen policies: directe toegang via anon/auth-clients is geblokkeerd.
-- De server-actions lezen/schrijven via de service-role admin-client (zelfde patroon als
-- getCurrentMedewerker op `medewerkers`).
alter table public.dossier_notities enable row level security;

-- Eenmalige data-migratie: de Bouw7-waarde stond in `opmerkingen` maar komt uit het
-- Bouw7-veld `reference` en hoort in `referentie`. (Geverifieerd: van 508 projecten heeft
-- 0 een `notes`-waarde en 438 een `reference`-waarde.) De incrementele sync zou ongewijzigde
-- dossiers overslaan, dus deze move gebeurt hier eenmalig.
update public.dossiers
   set referentie = opmerkingen, opmerkingen = null
 where bouw7_id is not null
   and (referentie is null or referentie = '')
   and opmerkingen is not null and opmerkingen <> '';
