-- Gespreksnotities op een relatie: wat er met de opdrachtgever besproken is, met auteur,
-- tijdstip en optioneel de contactpersoon die aan de lijn zat.
--
-- Voedt twee schermen: de mobiele module Commercieel (/m/commercieel) en het blok Acquisitie
-- op de relatiepagina.
--
-- Waarom niet `contactpersonen.opmerkingen` hergebruiken (54 rijen gevuld): dat is één veld
-- dat elke collega overschrijft, zonder datum en zonder auteur. Een gespreksverslag is per
-- definitie een logboek — je wilt zien wie wat wanneer afsprak, niet de laatste versie.
--
-- De notitie hangt aan de RELATIE, niet aan de contactpersoon. Een gesprek gaat vaak over de
-- klant als geheel ("ze zijn aan het aanbesteden"), en zonder specifieke persoon zou je dat
-- nergens kwijt kunnen. De contactpersoon is daarom optioneel en `set null`: verdwijnt die
-- uit het adresboek, dan blijft het gesprek staan.
--
-- Patroon 1-op-1 als public.dossier_notities (20260629_dossier_notities_en_referentie.sql).
create table if not exists public.relatie_notities (
  id                uuid primary key default gen_random_uuid(),
  relatie_id        uuid not null references public.relaties(id)        on delete cascade,
  contactpersoon_id uuid          references public.contactpersonen(id) on delete set null,
  medewerker_id     uuid          references public.medewerkers(id)     on delete set null,
  inhoud            text not null,
  created_at        timestamptz not null default now()
);

-- Dekt de enige leesquery: alle notities van één relatie, nieuwste eerst.
create index if not exists relatie_notities_relatie_created_idx
  on public.relatie_notities (relatie_id, created_at desc);

comment on table public.relatie_notities is
  'Gespreksnotities per relatie (mobiele module Commercieel + Acquisitie-blok op de relatiepagina).';

-- RLS aan, geen policies: directe toegang via anon/authenticated is geblokkeerd. Lezen en
-- schrijven gaat uitsluitend via de service-role admin-client in server-actions, die zelf op
-- het recht `relaties` gaten. Zelfde opzet als dossier_notities; de authenticated-baseline
-- (20260616c) werkt op een vaste tabellijst, dus een nieuwe tabel erft daar niets van.
alter table public.relatie_notities enable row level security;
