-- Urenverantwoording — weekstaat, goedkeuring, verlofaanvraag en overurensaldo.
--
-- Medewerkers vullen per dag hun uren in op de mobiele weekstaat, dienen per week in,
-- de teamleider accordeert de hele week en daarna accorderen de projectleiders hun
-- eigen dossierregels. Pas een volledig goedgekeurde week gaat als hour-logs naar Bouw7.
--
-- Twee dingen die het ontwerp sturen:
--
--  1. DE BOUW7-UURSOORTEN ZIJN DE CATEGORIELIJST. Bouw7 kent 18 uursoorten (Gewerkte uren,
--     Reisuren, Vakantie uren, Ziek, Feestdag, Tijd voor tijd, alle verlofsoorten, ...) en die
--     dekken alles. EVA verzint daar geen eigen enum naast; een urenregel wijst rechtstreeks
--     naar planning_uursoorten. Wat EVA er wel bij nodig heeft is een classificatie per
--     uursoort — uren_categorie — voor de rekenregel en om te weten of een dossier verplicht is.
--
--  2. GEEN APARTE OVERUREN-REGEL. Overuren en opgenomen overuren zijn allebei tijd voor tijd.
--     Een week is indienbaar zodra de som >= de contracturen (de norm is een ondergrens, niet
--     een exacte match), en het saldo volgt uit het verschil. Zie de view uren_week_saldo.
--     Elke regel gaat dus naar Bouw7; er blijft geen labelregel achter die dubbel zou tellen.
--
-- RLS: alles hieronder is dicht voor iedereen behalve platformgebruikers, via de bestaande
-- is_platform_gebruiker(). De mobiele weekstaat draait op de service-role-client achter de
-- guards in lib/uren/*, precies zoals de rest van /m — een app-gebruiker (monteur) is geen
-- platformgebruiker en krijgt via de anon-client overal nul rijen terug. Dat is de bedoelde
-- bodem; het eigen-medewerker-filter zit in de server actions, niet in een policy.

-- ---------------------------------------------------------------------------
-- 1. Classificatie op de bestaande uursoorten
-- ---------------------------------------------------------------------------
-- null = nog niet geclassificeerd en daarmee niet kiesbaar in de weekstaat. Dat is de veilige
-- stand voor een uursoort die morgen in Bouw7 bijkomt: hij verschijnt vanzelf in de lijst maar
-- doet pas mee als iemand bewust bepaald heeft hoe hij telt.
alter table public.planning_uursoorten
  add column if not exists uren_categorie text
    check (uren_categorie in ('werk','afwezig','tijd_voor_tijd','feestdag'));

comment on column public.planning_uursoorten.uren_categorie is
  'Hoe deze uursoort meetelt in de weekstaat. werk = dossier + bewakingscode verplicht, bouwt saldo op; afwezig = op het indirecte-uren-dossier, telt als verantwoord; tijd_voor_tijd = verlaagt het saldo; feestdag = wordt voorgevuld. null = nog niet geclassificeerd, dus niet kiesbaar.';

-- ---------------------------------------------------------------------------
-- 2. Waar niet-projectgebonden uren landen
-- ---------------------------------------------------------------------------
-- Bouw7 eist een project op elke hour-log, ook op vakantie- en ziekuren. Everts heeft daar al
-- "Indirecte uren"-projecten voor per werkmaatschappij; hier wijzen we per werkmaatschappij aan
-- welke dat is.
alter table public.bedrijfsgegevens
  add column if not exists indirect_uren_dossier_id uuid
    references public.dossiers(id) on delete set null;

comment on column public.bedrijfsgegevens.indirect_uren_dossier_id is
  'Dossier waar niet-projectgebonden uren (verlof, ziek, feestdag, tijd voor tijd) op geboekt worden. Bouw7 eist een project op elke hour-log.';

-- ---------------------------------------------------------------------------
-- 3. Instellingen (singleton)
-- ---------------------------------------------------------------------------
create table if not exists public.uren_instellingen (
  id                      boolean primary key default true check (id),
  -- 32 van de 52 actieve medewerkers zitten in geen ploeg en hebben dus geen teamleider.
  -- Zonder terugval zou hun week nergens heen kunnen; deze persoon vangt dat op.
  terugval_goedkeurder_id uuid references public.medewerkers(id) on delete set null,
  -- Speling op de contracturen-ondergrens. 0 = geen speling.
  tolerantie_uren         numeric(4,2) not null default 0,
  -- ISO-weekdag (1 = maandag ... 7 = zondag) + tijd. Indienen uiterlijk vrijdag 17:00,
  -- goedkeuren uiterlijk maandag 12:00 daarna.
  indien_deadline_dag     smallint not null default 5 check (indien_deadline_dag between 1 and 7),
  indien_deadline_tijd    time     not null default '17:00',
  goedkeur_deadline_dag   smallint not null default 1 check (goedkeur_deadline_dag between 1 and 7),
  goedkeur_deadline_tijd  time     not null default '12:00',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
insert into public.uren_instellingen (id) values (true) on conflict (id) do nothing;

comment on table public.uren_instellingen is
  'Singleton met de bedrijfsbrede instellingen voor urenverantwoording (deadlines, terugvalgoedkeurder).';

-- ---------------------------------------------------------------------------
-- 4. De week-envelop
-- ---------------------------------------------------------------------------
create table if not exists public.uren_weken (
  id                 uuid primary key default gen_random_uuid(),
  medewerker_id      uuid not null references public.medewerkers(id) on delete cascade,
  -- jaar/week zijn ISO (extract isoyear/week), week_start is de maandag. Alle drie apart
  -- opgeslagen: op jaar+week wordt gededupliceerd, op week_start wordt gerekend en gesorteerd.
  jaar               smallint not null,
  week_nr            smallint not null check (week_nr between 1 and 53),
  week_start         date     not null,
  -- Snapshot van de norm op week_start. Een later gewijzigd rooster mag een al ingediende
  -- week nooit met terugwerkende kracht fout maken.
  contracturen       numeric(5,2) not null default 0,
  status             text not null default 'concept'
                       check (status in ('concept','ingediend','teamleider_akkoord','goedgekeurd','afgekeurd')),
  ingediend_op       timestamptz,
  ingediend_door     uuid references public.medewerkers(id) on delete set null,
  -- Wie de week moet beoordelen, bepaald bij indienen zodat een latere ploegwissel een
  -- openstaande week niet stilletjes naar iemand anders verplaatst.
  tl_goedkeurder_id  uuid references public.medewerkers(id) on delete set null,
  tl_beoordeeld_op   timestamptz,
  tl_beoordeeld_door uuid references public.medewerkers(id) on delete set null,
  afkeur_reden       text,
  bouw7_verstuurd_op timestamptz,
  bouw7_fouten       jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uren_weken_uniek unique (medewerker_id, jaar, week_nr)
);
create index if not exists uren_weken_status_idx on public.uren_weken (status, week_start desc);
create index if not exists uren_weken_goedkeurder_idx on public.uren_weken (tl_goedkeurder_id)
  where status = 'ingediend';

comment on column public.uren_weken.contracturen is
  'Norm op week_start, bevroren bij aanmaak. Ondergrens voor indienen, en de basis onder de saldo-mutatie.';
comment on column public.uren_weken.status is
  'concept -> ingediend -> teamleider_akkoord -> goedgekeurd. goedgekeurd is eindstation: die week gaat niet meer open.';

-- ---------------------------------------------------------------------------
-- 5. De urenregels
-- ---------------------------------------------------------------------------
-- De oude uren_regels was een doodlopend spoor: alleen gevuld door sluitWerkbon(), nergens
-- gelezen, nooit naar Bouw7 gestuurd, en leeg (0 rijen). Hij wordt hier vervangen.
drop table if exists public.uren_regels;

create table public.uren_regels (
  id                 uuid primary key default gen_random_uuid(),
  week_id            uuid not null references public.uren_weken(id) on delete cascade,
  -- Gedenormaliseerd: bijna elke query filtert of groepeert hierop zonder de week nodig te hebben.
  medewerker_id      uuid not null references public.medewerkers(id) on delete cascade,
  datum              date not null,
  uren               numeric(5,2) not null check (uren > 0 and uren <= 24),
  uursoort_id        uuid not null references public.planning_uursoorten(id),
  -- Bij uren_categorie 'werk' verplicht (afgedwongen in de server action, waar de categorie
  -- bekend is); bij de andere categorieen het indirecte-uren-dossier.
  dossier_id         uuid references public.dossiers(id) on delete set null,
  bewakingscode      text,
  bouw7_psl_id       integer,
  opmerking          text,
  planning_item_id   uuid references public.planning_items(id) on delete set null,
  -- Herkomst. Voorgevulde regels (feestdag, Bouw7-verlof) blijven aanpasbaar; wijkt de
  -- medewerker af, dan is dat zichtbaar voor de goedkeurder.
  bron               text not null default 'eva'
                       check (bron in ('eva','planning','bouw7_verlof','bouw7_feestdag')),
  afgeweken_van_bron boolean not null default false,
  -- Tweede goedkeuringsstap, per regel: alleen regels op een dossier hebben een projectleider.
  pl_status          text not null default 'nvt'
                       check (pl_status in ('nvt','open','akkoord','bezwaar')),
  pl_beoordeeld_op   timestamptz,
  pl_beoordeeld_door uuid references public.medewerkers(id) on delete set null,
  pl_opmerking       text,
  -- Een goedkeurder mag corrigeren voor hij akkoord geeft; de oude waarden blijven bewaard
  -- zodat de medewerker in zijn weekstaat ziet wat er met zijn regel is gebeurd.
  gewijzigd_door_goedkeurder_id uuid references public.medewerkers(id) on delete set null,
  gewijzigd_op       timestamptz,
  oorspronkelijke_waarden jsonb,
  -- Bouw7. bouw7_hour_log_id is de idempotentiesleutel: aanwezig = update, afwezig = create.
  -- Zonder dit levert opnieuw verzenden een duplicaat in Bouw7 op.
  bouw7_hour_log_id  integer,
  bouw7_status       text not null default 'niet_verzonden'
                       check (bouw7_status in ('niet_verzonden','verzonden','fout')),
  bouw7_fout         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists uren_regels_week_idx on public.uren_regels (week_id, datum);
create index if not exists uren_regels_medewerker_datum_idx on public.uren_regels (medewerker_id, datum);
create index if not exists uren_regels_dossier_datum_idx on public.uren_regels (dossier_id, datum);
-- De werklijst van de projectleider.
create index if not exists uren_regels_pl_open_idx on public.uren_regels (dossier_id)
  where pl_status = 'open';
-- Nog niet (of niet gelukt) naar Bouw7; voedt de opnieuw-verzenden-knop.
create index if not exists uren_regels_bouw7_open_idx on public.uren_regels (bouw7_status)
  where bouw7_status <> 'verzonden';

comment on table public.uren_regels is
  'Een regel per dag x uursoort x dossier. Elke regel gaat naar Bouw7 als hour-log; er is geen labelregel.';
comment on column public.uren_regels.bouw7_hour_log_id is
  'Id van de hour-log in Bouw7. Aanwezig in de POST-body = update, afwezig = create. Dit is de idempotentie.';

-- ---------------------------------------------------------------------------
-- 6. Onkosten — parkeren en reiskosten
-- ---------------------------------------------------------------------------
-- Bewust EVA-only: de hour-log van Bouw7 kent geen geldbedragen, en het als projectkosten boeken
-- zou de inkoopstroom raken. Voorlopig alleen registreren en tonen; koppeling of export later,
-- in overleg met de administratie.
create table if not exists public.uren_onkosten (
  id            uuid primary key default gen_random_uuid(),
  week_id       uuid not null references public.uren_weken(id) on delete cascade,
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  datum         date not null,
  dossier_id    uuid references public.dossiers(id) on delete set null,
  soort         text not null check (soort in ('parkeren','reiskosten','overig')),
  bedrag        numeric(10,2) not null check (bedrag >= 0),
  km            numeric(6,1) check (km >= 0),
  omschrijving  text,
  bon_url       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists uren_onkosten_week_idx on public.uren_onkosten (week_id, datum);
create index if not exists uren_onkosten_medewerker_idx on public.uren_onkosten (medewerker_id, datum);

-- ---------------------------------------------------------------------------
-- 7. Overurensaldo
-- ---------------------------------------------------------------------------
-- Beginstand bij ingebruikname en latere handmatige correcties. Positief = bij, negatief = af.
create table if not exists public.uren_saldo_correcties (
  id            uuid primary key default gen_random_uuid(),
  medewerker_id uuid not null references public.medewerkers(id) on delete cascade,
  datum         date not null,
  uren          numeric(6,2) not null,
  reden         text not null,
  door          uuid references public.medewerkers(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists uren_saldo_correcties_medewerker_idx
  on public.uren_saldo_correcties (medewerker_id, datum);

-- Saldo-mutatie per goedgekeurde week:
--   som(alle regels behalve tijd voor tijd) - contracturen
-- 45u gewerkt bij 37,5 contract -> +7,5. 32u gewerkt + 5,5 tijd voor tijd -> 32 - 37,5 = -5,5.
create or replace view public.uren_week_saldo as
select w.id as week_id,
       w.medewerker_id,
       w.jaar,
       w.week_nr,
       w.week_start,
       w.contracturen,
       coalesce(sum(r.uren), 0) as totaal_uren,
       coalesce(sum(r.uren) filter (where u.uren_categorie is distinct from 'tijd_voor_tijd'), 0)
         - w.contracturen as saldo_mutatie
from public.uren_weken w
left join public.uren_regels r on r.week_id = w.id
left join public.planning_uursoorten u on u.id = r.uursoort_id
where w.status = 'goedgekeurd'
group by w.id;

comment on view public.uren_week_saldo is
  'Saldo-mutatie per goedgekeurde week. Tijd-voor-tijd-uren tellen niet mee als verantwoording en verlagen daarmee het saldo; alle andere uren bouwen het op.';

-- Doorlopend saldo per medewerker: de goedgekeurde weken plus de handmatige correcties.
create or replace view public.uren_saldo_per_medewerker as
select m.id as medewerker_id,
       coalesce((select sum(s.saldo_mutatie) from public.uren_week_saldo s where s.medewerker_id = m.id), 0)
       + coalesce((select sum(c.uren) from public.uren_saldo_correcties c where c.medewerker_id = m.id), 0)
       as saldo_uren
from public.medewerkers m;

-- ---------------------------------------------------------------------------
-- 8. Verlofaanvragen
-- ---------------------------------------------------------------------------
-- Aanvragen loopt voortaan door EVA. Bij goedkeuring ontstaat een medewerker_afwezigheid-rij
-- (waarmee de planning en de werkvoorraad meteen kloppen) en gaat het verlof als day-off naar
-- Bouw7. Daarna vult de weekstaat de dagen voor.
create table if not exists public.verlof_aanvragen (
  id              uuid primary key default gen_random_uuid(),
  medewerker_id   uuid not null references public.medewerkers(id) on delete cascade,
  -- Een uursoort met uren_categorie 'afwezig': Vakantie uren, Zorg verlof, Ouderschapsverlof,
  -- ATV / Roostervrij, Onbetaald verlof, ...
  uursoort_id     uuid not null references public.planning_uursoorten(id),
  start_datum     date not null,
  eind_datum      date not null,
  hele_dagen      boolean not null default true,
  start_tijd      time,
  eind_tijd       time,
  -- Afgeleid uit het rooster over de periode, met feestdagen eruit. Bevroren bij aanvraag.
  uren_totaal     numeric(6,2) not null default 0,
  toelichting     text,
  status          text not null default 'aangevraagd'
                    check (status in ('aangevraagd','goedgekeurd','afgewezen','ingetrokken')),
  goedkeurder_id  uuid references public.medewerkers(id) on delete set null,
  beoordeeld_op   timestamptz,
  beoordeeld_door uuid references public.medewerkers(id) on delete set null,
  afwijzing_reden text,
  afwezigheid_id  uuid references public.medewerker_afwezigheid(id) on delete set null,
  bouw7_day_off_id text,
  bouw7_status    text not null default 'niet_verzonden'
                    check (bouw7_status in ('niet_verzonden','verzonden','fout')),
  bouw7_fout      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint verlof_aanvragen_periode check (eind_datum >= start_datum)
);
create index if not exists verlof_aanvragen_medewerker_idx
  on public.verlof_aanvragen (medewerker_id, start_datum desc);
create index if not exists verlof_aanvragen_open_idx on public.verlof_aanvragen (goedkeurder_id)
  where status = 'aangevraagd';

comment on table public.verlof_aanvragen is
  'Verlofaanvraag met goedkeuring. Bij akkoord ontstaat een medewerker_afwezigheid-rij en gaat het verlof als day-off naar Bouw7; de weekstaat vult die dagen daarna voor.';

-- ---------------------------------------------------------------------------
-- 9. updated_at-triggers (zelfde patroon als de planning-module)
-- ---------------------------------------------------------------------------
do $trig$
declare t text;
begin
  foreach t in array array['uren_instellingen','uren_weken','uren_regels','uren_onkosten','verlof_aanvragen']
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
-- 10. RLS
-- ---------------------------------------------------------------------------
-- Dicht voor iedereen behalve platformgebruikers. De mobiele weekstaat leest en schrijft via de
-- service-role-client achter de guards in lib/uren/*; een monteur (app_gebruiker) is geen
-- platformgebruiker en ziet via de anon-client dus niets. is_platform_gebruiker() verruimen zou
-- die muur slopen en gebeurt hier niet.
do $rls$
declare t text;
begin
  foreach t in array array['uren_instellingen','uren_weken','uren_regels','uren_onkosten',
                           'uren_saldo_correcties','verlof_aanvragen']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_platform', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker())',
      t || '_platform', t);
  end loop;
end
$rls$;
