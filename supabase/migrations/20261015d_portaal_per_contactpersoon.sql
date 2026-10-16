-- Klantportaal per contactpersoon: nieuwe dossiers gaan vanzelf open.
-- Toegepast op 2026-10-16. Niet via apply_migration (dat kwam vanuit de sessie niet door), maar
-- stapsgewijs via execute_sql; daarna handmatig geregistreerd in supabase_migrations.
--
-- Tot nu toe was toegang al per persoon (portaal_gebruikers + scope), maar een dossier bestond
-- pas voor het portaal als iemand het op de Portaal-tab openzette. In de praktijk werd dat
-- vergeten: de opdrachtgever had een account, maar zijn nieuwe project stond er niet in.
--
-- Vanaf nu: heeft een contactpersoon portaaltoegang, dan gaat elk nieuw dossier binnen zijn
-- bereik vanzelf open — zijn eigen dossiers, of bij scope 'organisatie' alle dossiers van die
-- organisatie (een manager die ook de projecten van collega's volgt). Welke onderdelen er dan
-- aanstaan komt uit één centrale standaard (portaal_standaard_onderdelen).
--
-- Wat bewust NIET verandert:
--  - Bestanden en foto's blijven per stuk opt-in (portaal_bestanden). Een onderdeel aanzetten
--    toont alleen wat al is vrijgegeven.
--  - Betrokkenen (architect, opzichter, VvE-lid) krijgen niets automatisch; de regel kijkt
--    alleen naar dossiers.contactpersoon_id en dossiers.klant_id.
--  - Meekijkers (scope 'alleen_gekoppeld') blijven puur handmatig.
--  - Interne en afgesloten dossiers gaan nooit vanzelf open.
--  - Een bewust dichtgezet dossier blijft dicht: actief_handmatig wint van de automatiek,
--    hetzelfde patroon als toon_meerwerk_handmatig.

-- ---------------------------------------------------------------------------
-- Een mens heeft over "open of dicht" beslist
-- ---------------------------------------------------------------------------
alter table public.portaal_dossier_instellingen
  add column if not exists actief_handmatig boolean not null default false;

comment on column public.portaal_dossier_instellingen.actief_handmatig is
  'Iemand heeft actief zelf gezet op de Portaal-tab. Zolang dit false is, mag de automatiek het dossier openzetten.';

-- Bestaande rijen waar een medewerker aan heeft gezeten tellen als handmatig: daar kan een
-- bewuste keuze achter zitten. Rijen die alleen door de meerwerk-trigger zijn aangemaakt
-- (gewijzigd_door leeg) zijn dat niet.
update public.portaal_dossier_instellingen
  set actief_handmatig = true
  where gewijzigd_door is not null and actief_handmatig = false;

-- ---------------------------------------------------------------------------
-- De standaard bij automatisch openzetten
-- ---------------------------------------------------------------------------
-- Eén rij. Losse booleans, geen jsonb: zelfde reden als portaal_dossier_instellingen.
-- Meerwerk staat er niet in: dat regelt de meerwerk-trigger al (aan zodra er meerwerk is).
create table if not exists public.portaal_standaard_onderdelen (
  id                   boolean primary key default true check (id),
  toon_bestanden       boolean not null default true,
  toon_fotos           boolean not null default true,
  toon_facturen        boolean not null default false,
  toon_formulieren     boolean not null default false,
  toon_aandachtspunten boolean not null default false,
  toon_planning        boolean not null default true,
  toon_chat            boolean not null default true,
  gewijzigd_op         timestamptz not null default now(),
  gewijzigd_door       uuid references public.medewerkers(id) on delete set null
);

insert into public.portaal_standaard_onderdelen (id) values (true) on conflict (id) do nothing;

comment on table public.portaal_standaard_onderdelen is
  'Welke onderdelen aanstaan als een dossier automatisch voor het klantportaal wordt opengezet. Precies één rij.';

alter table public.portaal_standaard_onderdelen enable row level security;
drop policy if exists platform_gebruiker_toegang on public.portaal_standaard_onderdelen;
create policy platform_gebruiker_toegang on public.portaal_standaard_onderdelen
  for all to authenticated
  using ((select public.is_platform_gebruiker()))
  with check ((select public.is_platform_gebruiker()));

-- ---------------------------------------------------------------------------
-- De scope-regel in SQL
-- ---------------------------------------------------------------------------
-- LET OP: dit is dezelfde regel als getPortaalDossierIds() in
-- apps/dashboard/src/lib/portaal/auth.ts. Wijzig je de een, wijzig dan de ander.
-- Volgorde is gelijk: organisatie (met relatie) gaat voor, dan contactpersoon, dan particulier.
create or replace function public.portaal_gebruiker_ziet_dossier(
  p_scope text,
  p_relatie_id uuid,
  p_contactpersoon_id uuid,
  p_particulier_id uuid,
  p_dossier_klant_id uuid,
  p_dossier_contactpersoon_id uuid
) returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_scope = 'alleen_gekoppeld' then false
    when p_scope = 'organisatie' and p_relatie_id is not null
      then p_dossier_klant_id = p_relatie_id
    when p_contactpersoon_id is not null
      then p_dossier_contactpersoon_id = p_contactpersoon_id
    when p_particulier_id is not null and p_relatie_id is not null
      then p_dossier_klant_id = p_relatie_id
    else false
  end is true
$$;

-- ---------------------------------------------------------------------------
-- Eén dossier automatisch openzetten
-- ---------------------------------------------------------------------------
-- Zet alleen AAN, nooit uit. Bestaat er al een rij (bijvoorbeeld van de meerwerk-trigger),
-- dan komen de standaardonderdelen erbij zonder iets uit te zetten. Een dossier dat al open
-- staat of door een mens is dichtgezet, blijft zoals het is.
-- Geeft true terug als het dossier hierdoor open is gegaan.
create or replace function public.portaal_dossier_automatisch_openen(p_dossier_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_geopend boolean;
begin
  insert into public.portaal_dossier_instellingen as i (
    dossier_id, actief,
    toon_bestanden, toon_fotos, toon_facturen, toon_formulieren,
    toon_aandachtspunten, toon_planning, toon_chat, gewijzigd_op
  )
  select p_dossier_id, true,
    coalesce(s.toon_bestanden, false), coalesce(s.toon_fotos, false),
    coalesce(s.toon_facturen, false), coalesce(s.toon_formulieren, false),
    coalesce(s.toon_aandachtspunten, false), coalesce(s.toon_planning, false),
    coalesce(s.toon_chat, false), now()
  from (select 1) x
  left join public.portaal_standaard_onderdelen s on s.id
  on conflict (dossier_id) do update set
    actief               = true,
    toon_bestanden       = i.toon_bestanden       or excluded.toon_bestanden,
    toon_fotos           = i.toon_fotos           or excluded.toon_fotos,
    toon_facturen        = i.toon_facturen        or excluded.toon_facturen,
    toon_formulieren     = i.toon_formulieren     or excluded.toon_formulieren,
    toon_aandachtspunten = i.toon_aandachtspunten or excluded.toon_aandachtspunten,
    toon_planning        = i.toon_planning        or excluded.toon_planning,
    toon_chat            = i.toon_chat            or excluded.toon_chat,
    gewijzigd_op         = now()
  where i.actief = false and i.actief_handmatig = false
  returning true into v_geopend;

  return coalesce(v_geopend, false);
end
$$;

comment on function public.portaal_dossier_automatisch_openen(uuid) is
  'Zet een dossier open in het klantportaal met de standaardonderdelen, tenzij het al open is of door een medewerker is dichtgezet.';

-- ---------------------------------------------------------------------------
-- Alle lopende dossiers van één portaalgebruiker openzetten
-- ---------------------------------------------------------------------------
-- Aangeroepen vanuit EVA bij uitnodigen, heractiveren en een scopewijziging. Afgesloten en
-- interne dossiers blijven buiten beschouwing: een manager die vandaag toegang krijgt, hoeft
-- niet tien jaar aan afgeronde projecten in zijn portaal te vinden.
create or replace function public.portaal_gebruiker_dossiers_openen(p_gebruiker_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.portaal_gebruikers;
  d record;
  n integer := 0;
begin
  select * into g from public.portaal_gebruikers where id = p_gebruiker_id and actief;
  if not found then return 0; end if;

  for d in
    select id from public.dossiers
    where bord not in ('intern', 'afgesloten')
      and public.portaal_gebruiker_ziet_dossier(
            g.scope, g.relatie_id, g.contactpersoon_id, g.particulier_id, klant_id, contactpersoon_id)
  loop
    if public.portaal_dossier_automatisch_openen(d.id) then n := n + 1; end if;
  end loop;

  return n;
end
$$;

comment on function public.portaal_gebruiker_dossiers_openen(uuid) is
  'Zet alle lopende dossiers binnen het bereik van deze portaalgebruiker open. Geeft het aantal nieuw geopende dossiers terug.';

-- ---------------------------------------------------------------------------
-- De trigger: een nieuw (of omgehangen) dossier
-- ---------------------------------------------------------------------------
-- Vuurt bij een nieuw dossier en wanneer opdrachtgever of contactpersoon wijzigt — ook als de
-- Bouw7-sync dat doet. Alleen een actief portaalaccount telt; een ingetrokken account niet.
create or replace function public.tg_portaal_dossier_automatisch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.klant_id is not distinct from old.klant_id
     and new.contactpersoon_id is not distinct from old.contactpersoon_id then
    return null;
  end if;

  if new.bord in ('intern', 'afgesloten') then
    return null;
  end if;

  if exists (
    select 1 from public.portaal_gebruikers g
    where g.actief
      and public.portaal_gebruiker_ziet_dossier(
            g.scope, g.relatie_id, g.contactpersoon_id, g.particulier_id,
            new.klant_id, new.contactpersoon_id)
  ) then
    perform public.portaal_dossier_automatisch_openen(new.id);
  end if;

  return null;
end
$$;

drop trigger if exists tg_portaal_dossier_automatisch on public.dossiers;
create trigger tg_portaal_dossier_automatisch
  after insert or update of klant_id, contactpersoon_id on public.dossiers
  for each row
  execute function public.tg_portaal_dossier_automatisch();

-- Opzoeken van portaalgebruikers per contactpersoon (trigger en contactpersoonpagina).
create index if not exists portaal_gebruikers_contactpersoon_idx
  on public.portaal_gebruikers (contactpersoon_id) where actief;

-- De openzet-functies draaien als security definer; alleen de server (service role) roept ze aan.
-- De triggerfunctie hoeft door niemand rechtstreeks aangeroepen te worden (Postgres controleert
-- dat recht alleen bij het aanmaken van de trigger, niet bij het afgaan).
revoke all on function public.portaal_dossier_automatisch_openen(uuid) from public, anon, authenticated;
revoke all on function public.portaal_gebruiker_dossiers_openen(uuid) from public, anon, authenticated;
revoke all on function public.tg_portaal_dossier_automatisch() from public, anon, authenticated;
revoke execute on function public.portaal_gebruiker_ziet_dossier(text, uuid, uuid, uuid, uuid, uuid) from anon;
grant execute on function public.portaal_dossier_automatisch_openen(uuid) to service_role;
grant execute on function public.portaal_gebruiker_dossiers_openen(uuid) to service_role;
