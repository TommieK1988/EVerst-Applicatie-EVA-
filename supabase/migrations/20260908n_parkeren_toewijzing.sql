-- Parkeerkosten toewijzen aan een dossier.
--
-- Parkeerkosten belanden nu in de algemene kosten, terwijl ze projectgebonden
-- zijn: een monteur parkeert bij het werkadres waar hij die dag staat. Deze
-- tabellen leggen vast welk dossier bij een parkeerkost hoort, hoe zeker dat is,
-- en waarop dat oordeel berust.
--
-- Fase 1 blijft binnen EVA (zichtbaar op het dossier, doorbelastbaar bij regie).
-- De bouw7_*-kolommen staan er nu al zodat de eerste boeking naar Bouw7 later
-- idempotent kan zijn zonder migratie op een gevulde tabel -- dezelfde les als
-- uren_regels.bouw7_hour_log_id en werkbegroting_bestellingen.bouw7_contract_id.

-- ---------------------------------------------------------------------------
-- 1. Instellingen (singleton) -- drempels kunnen ijken zonder code-wijziging
-- ---------------------------------------------------------------------------
create table if not exists public.parkeer_toewijzing_instellingen (
  id                    boolean primary key default true check (id),
  -- Voor deze datum niet beoordelen. Zonder ondergrens vult de werkvoorraad zich
  -- met oude rijen waarvoor nooit meer een planning- of urensignaal komt.
  startdatum            date    not null default '2026-01-01',
  -- Hoe ver een ronde terugkijkt. Planning schuift en uren komen later binnen,
  -- dus een onbesliste rij moet meerdere keren opnieuw langskomen.
  venster_dagen         smallint not null default 60,
  -- Rit-eind mag zoveel voor (en na) de parkeerstart liggen om als "deze rit" te
  -- tellen. Gemeten: 92% van de parkeerkosten ligt binnen een uur na het
  -- rit-einde; ruim aan de voorkant vangt een tijdzone-afwijking op.
  rit_venster_voor_min  smallint not null default 360,
  rit_venster_na_min    smallint not null default 60,
  straal_dichtbij_m     integer not null default 150,
  straal_nabij_m        integer not null default 400,
  straal_ruim_m         integer not null default 1000,
  min_score_zeker       smallint not null default 50,
  -- Voorsprong op de tweede kandidaat. Zonder marge zou een gelijkspel tussen
  -- twee projecten alsnog automatisch geboekt worden.
  min_marge_zeker       smallint not null default 25,
  -- Nulbedragen leveren niets op om te verdelen en horen niet in een werklijst.
  min_bedrag            numeric(8,2) not null default 0.01,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
insert into public.parkeer_toewijzing_instellingen (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. De toewijzingen
-- ---------------------------------------------------------------------------
-- Bewust een aparte tabel en geen kolommen op ulu_parking: die wordt bij elke
-- import ge-upsert, en een menselijk oordeel mag niet aan een importactie hangen.
-- Bovendien kan een parkeerkost over twee dossiers gesplitst worden.
create table if not exists public.parkeer_toewijzingen (
  id                uuid primary key default gen_random_uuid(),
  parking_id        uuid not null references public.ulu_parking(id) on delete cascade,

  -- aandeel = 1 in het normale geval; de som per parkeerkost is exact 1.
  aandeel           numeric(6,4) not null default 1 check (aandeel > 0 and aandeel <= 1),
  -- Het bedrag ligt vast op het moment van toewijzen, niet berekend bij lezen:
  -- een later gecorrigeerd parkeerbedrag mag een al doorbelaste regel niet wijzigen.
  bedrag            numeric(8,2) not null default 0 check (bedrag >= 0),

  dossier_id        uuid references public.dossiers(id) on delete set null,
  bewakingscode     text,
  bouw7_psl_id      integer,

  -- Waarop de match berust
  medewerker_id     uuid references public.medewerkers(id) on delete set null,
  ulu_user_id       bigint,
  trip_id           uuid references public.ulu_trips(id) on delete set null,
  -- Matchdag. Bij voorkeur ulu_trips.start_datum (zonevrij opgeslagen, dus
  -- immuun voor tijdzone-drift); zonder rit afgeleid uit de parkeerstart in NL-tijd.
  datum             date not null,

  status            text not null default 'voorstel'
                      check (status in ('voorstel','bevestigd','afgewezen','prive','geen_kandidaat')),
  zekerheid         text not null default 'geen'
                      check (zekerheid in ('zeker','waarschijnlijk','onzeker','geen')),
  score             smallint not null default 0,
  -- Alle gewogen signalen, inclusief de afgevallen kandidaten. Zonder deze
  -- onderbouwing kan niemand in de werkvoorraad een voorstel beoordelen.
  signalen          jsonb not null default '{}'::jsonb,

  bevestiging_bron  text check (bevestiging_bron in ('automatisch','handmatig')),
  bevestigd_op      timestamptz,
  bevestigd_door    uuid references public.medewerkers(id) on delete set null,
  toelichting       text,

  bouw7_ticket_id   integer,
  bouw7_status      text not null default 'niet_verzonden'
                      check (bouw7_status in ('niet_verzonden','verzonden','fout')),
  bouw7_fout        text,

  laatste_run_op    timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Een rij per (parkeerkost, dossier); en hooguit een "nog geen dossier"-rij.
create unique index if not exists parkeer_toew_parking_dossier_uniek
  on public.parkeer_toewijzingen (parking_id, dossier_id) where dossier_id is not null;
create unique index if not exists parkeer_toew_parking_leeg_uniek
  on public.parkeer_toewijzingen (parking_id) where dossier_id is null;
create index if not exists parkeer_toew_werkvoorraad_idx
  on public.parkeer_toewijzingen (datum desc) where status = 'voorstel';
create index if not exists parkeer_toew_dossier_idx
  on public.parkeer_toewijzingen (dossier_id, datum);
create index if not exists parkeer_toew_bouw7_open_idx
  on public.parkeer_toewijzingen (bouw7_status) where bouw7_status <> 'verzonden';

comment on table public.parkeer_toewijzingen is
  'Koppeling parkeerkost naar dossier. Een rij met status bevestigd of afgewezen is een oordeel en wordt door de engine nooit overschreven.';
comment on column public.parkeer_toewijzingen.signalen is
  'Onderbouwing van het voorstel: gewogen signalen en afgevallen kandidaten. Voedt de uitleg in de werkvoorraad.';
comment on column public.parkeer_toewijzingen.bouw7_ticket_id is
  'Id van de leverbon in Bouw7 (fase 2). Aanwezig = update, leeg = create. Dit is de idempotentie.';

-- ---------------------------------------------------------------------------
-- 3. Controleview -- bewaakt dat een verdeling optelt tot het hele bedrag
-- ---------------------------------------------------------------------------
-- Zonder deze controle lekt een afrondingsfout stil het dossiertotaal in.
create or replace view public.v_parkeer_toewijzing_controle as
select p.id as parking_id, p.kenteken, p.parkeer_starttijd,
       p.parkeerkosten,
       sum(t.aandeel) as som_aandeel,
       sum(t.bedrag)  as som_bedrag
  from public.ulu_parking p
  join public.parkeer_toewijzingen t on t.parking_id = p.id
 where t.dossier_id is not null
 group by p.id, p.kenteken, p.parkeer_starttijd, p.parkeerkosten
having abs(sum(t.aandeel) - 1) > 0.0001
    or abs(sum(t.bedrag) - coalesce(p.parkeerkosten, 0)) > 0.005;

comment on view public.v_parkeer_toewijzing_controle is
  'Parkeerkosten waarvan de verdeling niet optelt tot 1 (of niet tot het bedrag). Hoort altijd leeg te zijn.';

-- ---------------------------------------------------------------------------
-- 4. Actieve dossiers als SQL-predicaat
-- ---------------------------------------------------------------------------
-- Spiegel van isActiefDossier() in apps/dashboard/src/lib/dossiers/actief.ts.
-- De engine moet kandidaat-dossiers in SQL kunnen filteren; alle dossiers in
-- JavaScript laden zou stil op de PostgREST-grens van 1000 rijen stuklopen.
-- Wijzigt die functie, dan moet deze view mee.
create or replace view public.v_dossier_actief as
select d.id,
       (d.gearchiveerd is not true
        and case d.hoofdstatus::text
              when 'aanvraag' then coalesce(d.aanvraag_substatus::text, '') not in ('afgewezen', 'vervallen')
              when 'offerte'  then coalesce(d.offerte_substatus::text, '')  not in ('gewonnen', 'verloren', 'vervallen')
              when 'opdracht' then coalesce(d.opdracht_substatus::text, '') is distinct from 'financieel_afgesloten'
              else true
            end
        -- Servicedesk-overlay: geldt naast de fase-status, niet in plaats daarvan.
        and (d.servicedesk_substatus is null
             or d.servicedesk_substatus::text is distinct from 'financieel_gereed')
       ) as actief
  from public.dossiers d;

comment on view public.v_dossier_actief is
  'SQL-spiegel van isActiefDossier() in lib/dossiers/actief.ts. Aanpassen zodra die functie wijzigt.';

-- ---------------------------------------------------------------------------
-- 5. updated_at-triggers
-- ---------------------------------------------------------------------------
do $trig$
declare t text;
begin
  foreach t in array array['parkeer_toewijzingen', 'parkeer_toewijzing_instellingen']
  loop
    if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_' || t) then
      execute format(
        'create trigger set_updated_at_%1$s before update on public.%1$s for each row execute function public.tg_set_updated_at()',
        t);
    end if;
  end loop;
end
$trig$;

-- ---------------------------------------------------------------------------
-- 6. RLS -- dicht voor iedereen behalve platformgebruikers
-- ---------------------------------------------------------------------------
-- De engine draait op de directe pooler en de server actions achter
-- vereisRecht('wagenpark', ...). Deze policies houden een klantportaal- of
-- monteur-sessie (wel authenticated, geen platformgebruiker) buiten de deur.
do $rls$
declare t text;
begin
  foreach t in array array['parkeer_toewijzingen', 'parkeer_toewijzing_instellingen']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_platform', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker())',
      t || '_platform', t);
  end loop;
end
$rls$;
