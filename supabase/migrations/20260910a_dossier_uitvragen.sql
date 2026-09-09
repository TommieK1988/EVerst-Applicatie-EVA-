-- Uitvragen bij onderaannemers en leveranciers, per dossier.
--
-- Tijdens de aanvraagfase wordt bij onderaannemers en leveranciers om prijzen gevraagd. Dat leefde
-- tot nu toe in de mailbox van de calculator: niemand anders kon zien bij wie was uitgevraagd, wat er
-- nog niet terug was, en hoe lang dat al duurde.
--
-- Eén rij = één partij die voor één discipline is uitgevraagd. "Staat extern uit" = status 'open'
-- MET een aangevraagd_op: een regel die je wel alvast aanmaakte maar nog niet verstuurde, hoort niet
-- in het rappel-overzicht.
--
-- Bewust GEEN uitbreiding van werkbegroting_bestellingen: die tabel is 1-op-1 gekoppeld aan een
-- Bouw7-contract (unique index op bouw7_contract_id). Een uitvraag is juist de fase vóór dat er een
-- document bestaat; hem daar inhangen zou een half-af contract in Bouw7 opleveren.

create table if not exists public.dossier_uitvragen (
  id                      uuid primary key default gen_random_uuid(),
  dossier_id              uuid not null references public.dossiers(id) on delete cascade,
  volgnummer              int  not null default 1,
  discipline              text not null,
  soort                   text not null default 'onderaannemer'
                            check (soort in ('onderaannemer','leverancier')),
  relatie_id              uuid references public.relaties(id) on delete set null,
  partij_naam             text not null,
  status                  text not null default 'open'
                            check (status in ('open','ontvangen','gegund','afgevallen','ingetrokken')),
  aangevraagd_op          date,
  ontvangen_op            date,
  reactie_uiterlijk       date,
  laatst_gerappelleerd_op timestamptz,
  rappels                 int  not null default 0,
  laatst_gemaild_naar     text[],
  opmerking               text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid
);

create index if not exists idx_dossier_uitvragen_dossier
  on public.dossier_uitvragen (dossier_id, volgnummer);

create index if not exists idx_dossier_uitvragen_open
  on public.dossier_uitvragen (relatie_id, aangevraagd_op) where status = 'open';

comment on table public.dossier_uitvragen is
  'Uitvragen bij onderaannemers/leveranciers per dossier: bij wie is welke discipline uitgevraagd, wanneer aangevraagd/ontvangen, en de rappel-historie. status=open met een aangevraagd_op telt als extern openstaand.';

comment on column public.dossier_uitvragen.partij_naam is
  'Naam van de uitgevraagde partij op het moment van vastleggen. Bewust gedenormaliseerd naast relatie_id, zodat de regel leesbaar en groepeerbaar blijft als de relatie verdwijnt of wordt hernoemd.';

comment on column public.dossier_uitvragen.discipline is
  'Discipline/onderdeel als vrije tekst ("Dak", "Gevel"). Bewust geen FK naar kwaliteit_disciplines: dat is KAM-stamdata voor inspectierondes, en een hernoeming daar zou stil het inkoopproces raken. De UI stelt eerder gebruikte waarden voor.';

comment on column public.dossier_uitvragen.laatst_gemaild_naar is
  'Adressen waarnaar de laatste uitvraag/rappel ging. Prefill voor een volgende rappel, zodat die bij dezelfde persoon aankomt en niet op een algemeen adres verdwijnt.';

-- RLS volgens het nieuwere patroon (is_platform_gebruiker), niet het oude `using (true)`:
-- `authenticated` omvat sinds het klantportaal ook opdrachtgever-accounts, en hier staan
-- leveranciersnamen en inkooprelaties in.
alter table public.dossier_uitvragen enable row level security;
drop policy if exists platform_gebruikers_all on public.dossier_uitvragen;
create policy platform_gebruikers_all on public.dossier_uitvragen
  for all to authenticated
  using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker());
