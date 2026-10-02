-- Bestandssoorten en per-dossier bestandsgegevens voor de Bestanden-tab.
--
-- bestand_soorten: de soorten die je in de kolom "Soort" kunt kiezen, beheerd in
-- Instellingen. Trefwoorden en extensies laten EVA de soort zelf herkennen; de
-- eerste soort (op volgorde) die past wint.
--
-- dossier_bestand_meta: wat EVA per bestand bijhoudt dat de bron niet kent.
--   * soort_id     -- handmatig gekozen soort; leeg = automatisch herkennen
--   * weergavenaam -- alleen voor Bouw7: die heeft geen endpoint om te hernoemen.
--                     SharePoint-bestanden worden echt hernoemd in SharePoint.
-- De sleutel is dezelfde bronoverstijgende sleutel als bij de app- en
-- portaalvinkjes (`bouw7:<id>` / `sharepoint:<itemId>`).
--
-- Schrijven loopt via server actions (service role + rechtencheck); lezen mag
-- elke platformgebruiker.

create table if not exists public.bestand_soorten (
  id            uuid primary key default gen_random_uuid(),
  naam          text not null unique,
  trefwoorden   text[] not null default '{}',
  extensies     text[] not null default '{}',
  volgorde      integer not null default 0,
  actief        boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);

alter table public.bestand_soorten enable row level security;

drop policy if exists platform_gebruiker_lezen on public.bestand_soorten;
create policy platform_gebruiker_lezen
  on public.bestand_soorten
  for select to authenticated
  using (public.is_platform_gebruiker());

comment on table public.bestand_soorten is
  'Soorten voor de kolom Soort in de Bestanden-tab; trefwoorden/extensies voor automatische herkenning.';

create table if not exists public.dossier_bestand_meta (
  dossier_id     uuid not null references public.dossiers(id) on delete cascade,
  sleutel        text not null,
  weergavenaam   text,
  soort_id       uuid references public.bestand_soorten(id) on delete set null,
  bijgewerkt_op  timestamptz not null default now(),
  bijgewerkt_door uuid references public.medewerkers(id) on delete set null,
  primary key (dossier_id, sleutel)
);

alter table public.dossier_bestand_meta enable row level security;

drop policy if exists platform_gebruiker_lezen on public.dossier_bestand_meta;
create policy platform_gebruiker_lezen
  on public.dossier_bestand_meta
  for select to authenticated
  using (public.is_platform_gebruiker());

comment on table public.dossier_bestand_meta is
  'Per dossierbestand: handmatige soort en (alleen Bouw7) een EVA-weergavenaam.';

insert into public.bestand_soorten (naam, trefwoorden, extensies, volgorde) values
  ('Offerte',             '{offerte,quotation,prijsopgave}',                     '{}',            10),
  ('Opdrachtbevestiging', '{opdrachtbevestiging,akkoord}',        '{}',            20),
  ('Factuur',             '{factuur,invoice,creditnota}',                        '{}',            30),
  ('Tekening',            '{tekening,plattegrond,doorsnede,gevelaanzicht}','{dwg,dxf}',    40),
  ('Rapport',             '{rapport,rapportage,inspectie,opname,verslag}',       '{}',            50),
  ('Contract',            '{contract,overeenkomst,raamcontract}',                '{}',            60),
  ('Vergunning',          '{vergunning,melding,omgevingsvergunning}',            '{}',            70),
  ('Correspondentie',     '{brief}',                                        '{msg,eml}',     80)
on conflict (naam) do nothing;
