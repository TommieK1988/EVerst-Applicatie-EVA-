-- Offertebewaking: de commerciële proceslaag ná "offerte verzonden".
--
-- Bouw7 registreert de offerte; EVA bewaakt de commerciële beweging eromheen. Het doel is
-- voorkomen dat kansen worden vergeten, dubbel worden nagejaagd, of zonder eigenaar en datum
-- blijven hangen.
--
-- ONTWERPPRINCIPE — één ding onderhouden, de rest afleiden.
-- De gebruiker onderhoudt per dossier precies één record: de VOLGENDE STAP. Die heeft twee
-- vormen: 'actie' (wij zijn aan zet: wat/wie/wanneer) of 'wachten' (de bal ligt elders:
-- waarop/bij wie/wanneer hercontroleren). Alles wat een procesontwerp normaal als los veld
-- opvoert -- bewakingsstatus, "niet opvolgen vóór", "wachten zonder datum"-signalering,
-- kanban-kolommen voor Actief opvolgen / Reactie afwachten / Interne actie -- is daar een
-- AFLEIDING van, berekend at-read door bewakingsStatus() in lib/commercie/status.ts.
-- Daarom staan die velden hier bewust NIET.
--
-- Wat hier óók niet staat, en waarom:
--   * fase / commerciële status  -> dossiers.offerte_substatus is de fase, al two-way
--     gekoppeld met het Bouw7-maatwerkveld "Offerte Sub-status" (substatus-map.ts). Een
--     tweede ladder ernaast zou dubbele waarheid creëren.
--   * fase-historie              -> dossier_status_historie wordt al door DB-trigger
--     tg_dossier_status_change gevuld bij élke statuswijziging, ook vanuit de sync.
--   * offertebedrag / klant      -> staan al op het dossier; niet dupliceren.

-- == 1. De bewakingskaart ====================================================
-- Eén rij per commerciële kans. Vandaag altijd aan een dossier gekoppeld (soort='offerte').
-- `dossier_id` is bewust NULLABLE zodat een latere verkoopsignalen-flow (een kans waarvoor
-- nog géén offerte bestaat, bv. "beheerder noemt object X") in dezelfde tabel past zonder
-- migratie: soort='signaal' + titel gevuld, dossier_id leeg.
create table if not exists public.commercie_bewaking (
  id                  uuid        primary key default gen_random_uuid(),

  dossier_id          uuid        references public.dossiers(id) on delete cascade,
  soort               text        not null default 'offerte'
                        check (soort in ('offerte','signaal')),
  titel               text,

  -- Twee rollen, bewust gescheiden. De eigenaar blijft commercieel verantwoordelijk voor de
  -- kans; de actiehouder voert de eerstvolgende stap uit en wisselt voortdurend. Zonder dit
  -- onderscheid wordt degene die toevallig nabelt ten onrechte eigenaar van de kans.
  eigenaar_id         uuid        references public.medewerkers(id) on delete set null,
  actiehouder_id      uuid        references public.medewerkers(id) on delete set null,

  -- De volgende stap. Eén per kaart -- afgedwongen doordat dit kolommen zijn en geen
  -- child-tabel: er kunnen niet vijf open acties tegelijk bestaan.
  stap_soort          text        check (stap_soort in ('actie','wachten')),
  stap_tekst          text,
  stap_datum          date,        -- actiedatum, of bij 'wachten' de hercontroledatum
  wacht_op            text        check (wacht_op in ('klant','intern','extern')),

  -- Optioneel, alleen zinvol bij grotere trajecten; voedt de verwachte omzet in Management.
  kans_pct            smallint    check (kans_pct between 0 and 100),
  verwachte_opdracht  date,        -- maandprecisie: dag altijd 1

  -- Triage: is deze offerte commercieel beoordeeld? Zolang dit leeg is toont de kaart
  -- "nog niet beoordeeld", ongeacht of er al een stap staat.
  getrieerd_op        timestamptz,
  getrieerd_door      uuid        references public.medewerkers(id) on delete set null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Procesregel "geen actie zonder datum" en "geen stap zonder houder", op schemaniveau.
  constraint commercie_bewaking_stap_compleet check (
    stap_soort is null
    or (stap_tekst is not null and stap_datum is not null and actiehouder_id is not null)
  ),
  -- Procesregel "geen wachten zonder reden": waarop wachten we, en bij wie ligt de bal?
  constraint commercie_bewaking_wacht_op check (
    stap_soort is distinct from 'wachten' or wacht_op is not null
  ),
  -- Een signaal heeft geen dossier maar wel een titel; een offertekaart precies andersom.
  constraint commercie_bewaking_soort_bron check (
    (soort = 'offerte' and dossier_id is not null)
    or (soort = 'signaal' and titel is not null)
  )
);

-- Eén kaart per dossier: de kaart ís de commerciële waarheid voor dat dossier.
create unique index if not exists commercie_bewaking_dossier_uniek
  on public.commercie_bewaking (dossier_id) where dossier_id is not null;

-- Draagt de werklijst (sorteren/filteren op de eerstvolgende beweging) en het dagsignaal.
create index if not exists commercie_bewaking_stap_datum_idx
  on public.commercie_bewaking (stap_datum) where stap_datum is not null;
create index if not exists commercie_bewaking_actiehouder_idx
  on public.commercie_bewaking (actiehouder_id) where actiehouder_id is not null;
create index if not exists commercie_bewaking_eigenaar_idx
  on public.commercie_bewaking (eigenaar_id) where eigenaar_id is not null;

comment on table public.commercie_bewaking is
  'Commerciële opvolging per offerte/kans: eigenaar, actiehouder en de ene volgende stap. Bewakingsstatus en kleur worden hieruit afgeleid, niet opgeslagen.';
comment on column public.commercie_bewaking.stap_datum is
  'Actiedatum, of bij stap_soort=wachten de hercontroledatum. Die datum is tevens de "niet opvolgen voor"-grens die dubbel nabellen voorkomt.';

-- == 2. De tijdlijn ==========================================================
-- Wat er feitelijk is gebeurd, in volgorde. Dit is bewust géén CRM-dagboek: per gebeurtenis
-- één korte, feitelijke regel plus de gekozen uitkomst. Relatiekennis hoort elders.
--
-- Het scherm toont de samenvoeging van drie bronnen: deze tabel, dossier_status_historie
-- (fasewissels, bestaat al) en dossier_notities (bestaat al, inclusief de uit Bouw7
-- geïmporteerde offerte-herinneringen). Daarom worden die hier niet gedupliceerd.
create table if not exists public.commercie_gebeurtenissen (
  id                   uuid        primary key default gen_random_uuid(),
  bewaking_id          uuid        not null references public.commercie_bewaking(id) on delete cascade,

  soort                text        not null
                         check (soort in ('contact','stap','overdracht','notitie')),
  uitkomst             text,        -- de gekozen vaste uitkomstknop, bv. 'geen_gehoor'
  tekst                text,
  naar_actiehouder_id  uuid        references public.medewerkers(id) on delete set null,

  door                 uuid        references public.medewerkers(id) on delete set null,
  op                   timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

create index if not exists commercie_gebeurtenissen_bewaking_idx
  on public.commercie_gebeurtenissen (bewaking_id, op desc);

comment on table public.commercie_gebeurtenissen is
  'Tijdlijn per bewakingskaart: klantcontacten met uitkomst, stapwijzigingen en overdrachten.';

-- == 3. updated_at-trigger (hergebruik tg_set_updated_at) ====================
do $triggers$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_commercie_bewaking') then
    create trigger set_updated_at_commercie_bewaking
      before update on public.commercie_bewaking
      for each row execute function public.tg_set_updated_at();
  end if;
end $triggers$;

-- == 4. RLS (basislijn 20260705: platform-gebruikers) ========================
-- Vangnet, geen fijnmazige autorisatie: de rechten-scope wordt in de server-actions
-- afgedwongen via vereisRecht('dossiers'). Commerciële data mag niet zichtbaar zijn voor
-- klantportaal-accounts, die óók de rol `authenticated` hebben.
do $rls$
declare
  t text;
  tabellen text[] := array['commercie_bewaking','commercie_gebeurtenissen'];
begin
  foreach t in array tabellen loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists platform_gebruikers_all on public.%I', t);
    execute format(
      'create policy platform_gebruikers_all on public.%I for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker())',
      t
    );
  end loop;
end $rls$;
