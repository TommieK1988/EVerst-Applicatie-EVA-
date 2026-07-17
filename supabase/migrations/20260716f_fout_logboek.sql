-- Foutenlog — centraal logboek van wat er in EVA misgaat.
--
-- Tot nu toe verdwenen fouten in de Vercel-stdout: geen tracking, geen tabel, geen
-- overzicht. Deze tabel voedt /instellingen/foutenlog, waar een beheerder ziet wat
-- er misging, wanneer, hoe vaak en waar in de code.
--
-- Kernbesluit: één rij per UNIEKE fout, niet per voorval. De `fingerprint` (hash van
-- omgeving + bron + genormaliseerde melding, berekend in src/lib/fouten/log.ts) is
-- uniek; een herhaling verhoogt `aantal` in plaats van een nieuwe rij te maken. Zonder
-- dit levert één kapotte pagina die 200x geopend wordt 200 rijen op en is de lijst
-- binnen een dag onbruikbaar.

create table if not exists public.fout_logboek (
  id            uuid primary key default gen_random_uuid(),

  -- Identiteit van de fout: bepaalt of een voorval een nieuwe rij is of een ophoging.
  fingerprint   text not null unique,

  omgeving      text not null check (omgeving in ('server','browser','cron')),
  bron          text not null,                    -- '/dossiers/[id]', 'api/cron/bouw7-sync/[mode]'
  soort         text,                             -- Next routeType: render | route | action | middleware
  module        text,                             -- eerste padsegment: dossiers, planning, ...
  fout_type     text,                             -- err.name, bv. TypeError
  melding       text not null,                    -- afgekapt op 500 tekens
  stack         text,                             -- afgekapt op 8000 tekens
  digest        text,                             -- Next-foutcode; koppelt browser- aan serverrij
  url           text,
  medewerker_id uuid references public.medewerkers(id) on delete set null,
  extra         jsonb,                            -- method, user-agent, requestpad

  aantal        int not null default 1,
  eerst_op      timestamptz not null default now(),
  laatst_op     timestamptz not null default now(),

  opgelost      boolean not null default false,
  opgelost_op   timestamptz,
  opgelost_door uuid references public.medewerkers(id) on delete set null,
  notitie       text
);

-- De pagina toont standaard de openstaande fouten, nieuwste eerst.
create index if not exists fout_logboek_opgelost_laatst_idx
  on public.fout_logboek (opgelost, laatst_op desc);

-- Opruimcron filtert op laatst_op.
create index if not exists fout_logboek_laatst_idx
  on public.fout_logboek (laatst_op);

-- RLS aan zonder policies: schrijven gaat uitsluitend via log_fout() met de
-- service-role-client, lezen uitsluitend via de pagina die al achter een
-- beheerdersgate zit. Stacktraces kunnen klantgegevens bevatten.
alter table public.fout_logboek enable row level security;

-- ── log_fout(): idempotente registratie van één voorval ─────────────
-- Atomair: insert-or-increment in één statement, dus geen race tussen gelijktijdige
-- requests die dezelfde fout raken. Een nieuw voorval HEROPENT een afgevinkte fout —
-- als hij weer gebeurt, was hij niet opgelost.
create or replace function public.log_fout(
  p_fingerprint   text,
  p_omgeving      text,
  p_bron          text,
  p_melding       text,
  p_soort         text default null,
  p_module        text default null,
  p_fout_type     text default null,
  p_stack         text default null,
  p_digest        text default null,
  p_url           text default null,
  p_medewerker_id uuid default null,
  p_extra         jsonb default null
) returns uuid
language sql
set search_path = public
as $$
  insert into public.fout_logboek as f (
    fingerprint, omgeving, bron, melding, soort, module,
    fout_type, stack, digest, url, medewerker_id, extra
  )
  values (
    p_fingerprint, p_omgeving, p_bron, p_melding, p_soort, p_module,
    p_fout_type, p_stack, p_digest, p_url, p_medewerker_id, p_extra
  )
  on conflict (fingerprint) do update set
    aantal        = f.aantal + 1,
    laatst_op     = now(),
    -- Laatste voorval wint, maar nooit een gevulde waarde overschrijven met leeg.
    stack         = coalesce(excluded.stack, f.stack),
    digest        = coalesce(excluded.digest, f.digest),
    url           = coalesce(excluded.url, f.url),
    medewerker_id = coalesce(excluded.medewerker_id, f.medewerker_id),
    extra         = coalesce(excluded.extra, f.extra),
    opgelost      = false,
    opgelost_op   = null,
    opgelost_door = null
  returning f.id;
$$;

-- Alleen de service-role mag loggen; anders kan elke ingelogde gebruiker de RPC
-- rechtstreeks via PostgREST aanroepen en de tabel volschrijven.
revoke all on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) from public;
revoke all on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) from anon;
revoke all on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) from authenticated;
grant execute on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) to service_role;
