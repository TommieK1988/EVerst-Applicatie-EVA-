-- Meetstaten in eigen tabellen (fase 1a van "Meetstaten per object")
--
-- Aanleiding: de meetstaat leeft in de calculatie-snapshot (calculatie_snapshots.data,
-- JSONB) en is daardoor niet herbruikbaar. Een gebouw verandert weinig; bij een nieuwe
-- aanvraag wil je de maten terugvinden. Doel: één moeder-meetstaat per gebouw, bij het
-- object (of, zolang er geen object is, bij het dossier), waaruit calculaties halen.
--
-- Fase 1a is PUUR ADDITIEF. De snapshot blijft de bron van waarheid; de app schrijft bij
-- elke opslag een spiegel naar deze tabellen (lib/meetstaat/spiegel-schrijven.ts). Zo is
-- te controleren dat de nieuwe opslag klopt voordat er iets op gaat leunen.
--
-- Ontwerpkeuzes (besproken met Tom, 15-10-2026):
--   * Moeder-meetstaat, geen versies. Regels worden afgesloten (vervallen_op), nooit
--     verwijderd; elke regel heeft een opmeetdatum. FK's daarom ON DELETE RESTRICT.
--   * Gebouwdelen: max. twee niveaus, vrije namen (geen vaste lijst). `soort` legt
--     optioneel vast wat voor deel het is (gebouw, zijde, verdieping, eenheid, ruimte),
--     naar het voorbeeld van de ruimtelijke structuur in IFC. Later delen houtrot en
--     opname dezelfde delen.
--   * Twee soorten regels: schilderwerk (bibliotheek: onderdeel/type/code) en overig
--     (vrije maten uit de mini-meetstaat, met aftrekregels voor bruto/netto).
--   * NL-SfB-code op onderdelen en regels: voorbereiding op NEN 2767 / MJOP, nog zonder
--     conditievelden.
--
-- Toepassen: pas bij het mergen naar main, via de Supabase MCP. Daarna eenmalig de
-- bestaande meetstaten overzetten (zie de PR).

-- ── Gebouwdelen ─────────────────────────────────────────────────────────────
create table if not exists public.gebouw_delen (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid references public.vastgoed_objecten(id) on delete restrict,
  dossier_id    uuid references public.dossiers(id) on delete restrict,
  parent_id     uuid references public.gebouw_delen(id) on delete restrict,
  naam          text not null,
  soort         text check (soort in ('gebouw','zijde','verdieping','eenheid','ruimte')),
  volgorde      integer not null default 0,
  gearchiveerd_op timestamptz,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint gebouw_delen_anker check (object_id is not null or dossier_id is not null),
  constraint gebouw_delen_niet_eigen_ouder check (parent_id is distinct from id)
);
create index if not exists gebouw_delen_object_idx  on public.gebouw_delen(object_id);
create index if not exists gebouw_delen_dossier_idx on public.gebouw_delen(dossier_id);
create index if not exists gebouw_delen_parent_idx  on public.gebouw_delen(parent_id);

comment on table public.gebouw_delen is
  'Indeling van een gebouw (blok › gevel), max. twee niveaus. Hoort bij een object, of zolang er geen object is bij een dossier. Gedeeld door meetstaat en later houtrot en opname.';

-- ── Meetstaten (moeder-meetstaat) ───────────────────────────────────────────
create table if not exists public.meetstaten (
  id            uuid primary key default gen_random_uuid(),
  object_id     uuid references public.vastgoed_objecten(id) on delete restrict,
  dossier_id    uuid references public.dossiers(id) on delete restrict,
  naam          text not null,
  code          text not null default '',
  bron          text not null default 'eva' check (bron in ('eva','topo','gilde')),
  status        text not null default 'actief'
                check (status in ('actief','niet_gecontroleerd','gearchiveerd')),
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now(),
  constraint meetstaten_anker check (object_id is not null or dossier_id is not null)
);
create index if not exists meetstaten_object_idx  on public.meetstaten(object_id);
create index if not exists meetstaten_dossier_idx on public.meetstaten(dossier_id);

comment on table public.meetstaten is
  'Moeder-meetstaat van een gebouw. Wordt bijgewerkt, niet geversioneerd; calculaties houden hun eigen hoeveelheden.';

-- ── Meetregels ──────────────────────────────────────────────────────────────
create table if not exists public.meetstaat_regels (
  id                   uuid primary key default gen_random_uuid(),
  meetstaat_id         uuid not null references public.meetstaten(id) on delete restrict,
  soort                text not null default 'schilderwerk' check (soort in ('schilderwerk','overig')),
  deel_id              uuid references public.gebouw_delen(id) on delete restrict,
  volgorde             integer not null default 0,
  -- Schilderwerk: koppeling met de bibliotheek (ids) plus weergavenamen.
  element              text,
  onderdeel_id         uuid,
  type_id              uuid,
  behandeling_id       uuid,
  onderdeel            text,
  type                 text,
  behandeling          text,
  bestekcode           text,
  bestek_kenmerk       text,
  -- Overig (mini-meetstaat): vrije naam van de maat, bv. 'Gevelvlak'.
  naam                 text,
  -- Aftrekregel (ramen uit een gevelvlak): hoort bij een andere regel en telt negatief.
  aftrek_van_id        uuid references public.meetstaat_regels(id) on delete restrict,
  nlsfb                text,
  opmerking            text,
  -- Maatvoering: zelfde betekenis als in de meetstaat van de calculatie.
  breedte              numeric,
  hoogte               numeric,
  breedte_aantal       numeric,
  hoogte_aantal        numeric,
  factor               numeric,
  aantal               numeric not null default 0,
  eenheid              text not null default '',
  hoeveelheid_override numeric,
  opgemeten_op         timestamptz not null default now(),
  opgemeten_door       uuid references public.medewerkers(id) on delete set null,
  vervallen_op         timestamptz,
  aangemaakt_op        timestamptz not null default now(),
  bijgewerkt_op        timestamptz not null default now()
);
create index if not exists meetstaat_regels_meetstaat_idx on public.meetstaat_regels(meetstaat_id);
create index if not exists meetstaat_regels_deel_idx      on public.meetstaat_regels(deel_id);

comment on column public.meetstaat_regels.vervallen_op is
  'Afgesloten in plaats van verwijderd: bv. houten kozijn vervangen door kunststof. Blijft zichtbaar voor oude calculaties.';

-- ── Gebruik: welke calculatie haalt uit welke meetstaat ─────────────────────
create table if not exists public.meetstaat_gebruik (
  id            uuid primary key default gen_random_uuid(),
  meetstaat_id  uuid not null references public.meetstaten(id) on delete restrict,
  project_id    uuid not null references public.projects(id) on delete cascade,
  scenario_id   text not null,
  -- Keuze bij het overhalen (fase 2): delen, onderdelen, types, codes, opbouw.
  keuze         jsonb not null default '{}'::jsonb,
  aangemaakt_op timestamptz not null default now(),
  constraint meetstaat_gebruik_uniek unique (meetstaat_id, project_id, scenario_id)
);
create index if not exists meetstaat_gebruik_project_idx on public.meetstaat_gebruik(project_id);

-- ── NL-SfB op de schilderbibliotheek ────────────────────────────────────────
alter table public.schilder_onderdelen add column if not exists nlsfb text;
comment on column public.schilder_onderdelen.nlsfb is
  'NL-SfB-elementcode (bv. 31 buitenwandopeningen, 41 buitenwandafwerkingen). Voorbereiding op NEN 2767 / MJOP.';

-- ── RLS: zelfde regel als vastgoed_objecten ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['gebouw_delen','meetstaten','meetstaat_regels','meetstaat_gebruik'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'platform_gebruikers_all') then
      execute format(
        'create policy platform_gebruikers_all on public.%I for all to authenticated using ((select is_platform_gebruiker())) with check ((select is_platform_gebruiker()))',
        t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
