-- Goedkeuren van uren die in Bouw7 zijn ingevoerd.
--
-- De weekstaat in EVA heeft zijn eigen goedkeuringsketen (uren_weken), maar alle uren die er nu
-- zijn, zijn in Bouw7 zelf ingevoerd en hebben dus geen week in EVA. Ze zijn wel zichtbaar, niet
-- te accorderen. Deze tabel sluit dat gat.
--
-- WAAROM EEN EIGEN TABEL. Bouw7 kent maar één vlag: isApproved, ja of nee. Er is geen veld dat
-- vastlegt wie moet goedkeuren, en er zijn geen goedkeuring-endpoints voor uren (die bestaan alleen
-- voor contracten en inkoopfacturen; /list/approvals geeft 404). De afgesproken keten is eerst de
-- teamleider en dan de projectleider -- twee stappen op één vlag. Zonder een tussenstand aan onze
-- kant zou het teamleider-akkoord dus nergens bestaan.
--
-- DIT IS GEEN KOPIE VAN DE UREN. De uren blijven in Bouw7; hier staat alleen wie er wat mee deed.
-- Eén rij per uurregel die iemand heeft aangeraakt -- geen rij betekent "nog niemand heeft
-- ernaar gekeken", de normale begintoestand. Dat scheelt honderden lege rijen.
--
-- Wie mag beoordelen volgt uit de PROJECTROLLEN OP HET DOSSIER (dossiers.teamleider_id en
-- dossiers.project_manager_id), niet uit de ploeg van de medewerker: het hangt af van het werk,
-- niet van waar iemand organisatorisch hangt.
--
--   dossier heeft een teamleider            -> eerst hij, daarna de projectleider
--   dossier heeft geen teamleider           -> meteen naar de projectleider, zonder tussenstop
--   teamleider akkoord + geen projectleider -> approved = true (hij is dan eindstation)
--   projectleider akkoord                   -> approved = true, ook zonder teamleider
--   projectleider trekt terug               -> approved = false, teamleider vervalt
--
-- De projectleider overruled de teamleider dus altijd, in beide richtingen. Er is bewust geen
-- terugval op een ploegteamleider of op Directie: staat er niemand op het dossier, dan hoort de
-- regel bij "niet toe te wijzen" in plaats van op het bureau van iemand die er niets mee te maken
-- heeft.

create table if not exists public.uren_bouw7_beoordeling (
  -- Bouw7's eigen hour-log-id is de sleutel. Geen eigen uuid: de regel bestaat daar, niet hier,
  -- en zo kan er per uurregel nooit meer dan één beoordeling ontstaan.
  bouw7_hour_log_id bigint primary key,

  -- Afgeleid bij het aanraken, zodat filteren en tellen niet elke keer langs Bouw7 hoeft.
  -- Nullable: een uurregel kan van een medewerker of op een project zijn dat EVA niet kent.
  medewerker_id     uuid references public.medewerkers(id) on delete set null,
  dossier_id        uuid references public.dossiers(id) on delete set null,
  log_datum         date,

  tl_akkoord_op     timestamptz,
  tl_akkoord_door   uuid references public.medewerkers(id) on delete set null,

  pl_akkoord_op     timestamptz,
  pl_akkoord_door   uuid references public.medewerkers(id) on delete set null,

  -- Alleen de projectleider kan intrekken; de reden gaat als melding naar de medewerker.
  ingetrokken_op    timestamptz,
  ingetrokken_door  uuid references public.medewerkers(id) on delete set null,
  ingetrokken_reden text,

  -- Afkeuren bestaat niet als aparte stap: de goedkeurder corrigeert zelf en de medewerker krijgt
  -- daar bericht van. De oude waarden blijven bewaard, anders is achteraf niet na te gaan wat er
  -- veranderd is -- Bouw7 houdt alleen de nieuwe stand bij.
  gecorrigeerd_op   timestamptz,
  gecorrigeerd_door uuid references public.medewerkers(id) on delete set null,
  oorspronkelijke_waarden jsonb,

  -- Of het omzetten van de vlag in Bouw7 lukte.
  bouw7_status      text not null default 'niet_verzonden'
                      check (bouw7_status in ('niet_verzonden','verzonden','fout')),
  bouw7_fout        text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists uren_bouw7_beoordeling_medewerker_idx
  on public.uren_bouw7_beoordeling (medewerker_id, log_datum desc);
create index if not exists uren_bouw7_beoordeling_dossier_idx
  on public.uren_bouw7_beoordeling (dossier_id, log_datum desc);
-- De werklijst van de projectleider: teamleider is akkoord, hij nog niet.
create index if not exists uren_bouw7_beoordeling_wacht_op_pl_idx
  on public.uren_bouw7_beoordeling (dossier_id)
  where tl_akkoord_op is not null and pl_akkoord_op is null;

comment on table public.uren_bouw7_beoordeling is
  'Tussenstand van de goedkeuring van uren die in Bouw7 zijn ingevoerd. Bouw7 kent maar één vlag (isApproved) en legt niet vast wie moet goedkeuren; de keten teamleider -> projectleider leeft daarom hier. Geen rij = nog niemand heeft ernaar gekeken.';
comment on column public.uren_bouw7_beoordeling.bouw7_hour_log_id is
  'Het id van de uurregel in Bouw7. Tevens de primaire sleutel: de regel bestaat daar, niet hier.';
comment on column public.uren_bouw7_beoordeling.oorspronkelijke_waarden is
  'De waarden zoals ze waren voordat een goedkeurder de regel corrigeerde. Bouw7 bewaart alleen de nieuwe stand.';

do $trig$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_uren_bouw7_beoordeling') then
    create trigger set_updated_at_uren_bouw7_beoordeling
      before update on public.uren_bouw7_beoordeling
      for each row execute function public.tg_set_updated_at();
  end if;
end
$trig$;

-- RLS zoals de rest van de urenmodule: dicht voor iedereen behalve platformgebruikers. Alles
-- loopt via de service-role-client achter de guards in lib/uren/*.
alter table public.uren_bouw7_beoordeling enable row level security;
drop policy if exists uren_bouw7_beoordeling_platform on public.uren_bouw7_beoordeling;
create policy uren_bouw7_beoordeling_platform on public.uren_bouw7_beoordeling
  for all using (public.is_platform_gebruiker()) with check (public.is_platform_gebruiker());
