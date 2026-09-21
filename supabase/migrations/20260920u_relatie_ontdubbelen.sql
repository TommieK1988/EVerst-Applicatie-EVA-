-- =====================================================================
-- Relaties ontdubbelen: één bedrijf, meerdere rollen
-- =====================================================================
--
-- Bouw7 kent per contact precies één type (klant, leverancier, onderaannemer). Doet een
-- bedrijf twee dingen — Van der Kraan Totaalonderhoud koopt bij ons in én levert aan ons —
-- dan staat het daar twee keer, en die twee rijen kwamen één-op-één EVA binnen omdat
-- `syncContacts` `relaties.bouw7_id` als sleutel gebruikt en die kolom er maar één kan
-- bevatten.
--
-- EVA's datamodel kan het wél aan: `relaties.types` is een array en `voegTypesSamen` vult hem
-- al aan vanuit Bouw7. Gemeten op 20 september 2026: 672 relaties, waarvan 666 met precies
-- één type, 18 groepen met een identieke naamsleutel en 14 groepen met een gedeeld
-- KvK-nummer. Aan beide kanten van zo'n paar hangt echte administratie — VZB Vastgoed had
-- 7 dossiers en 9 debiteurenregels op de opdrachtgever-rij en 1 dossier plus een
-- inkoopfactuur op de leverancier-rij.
--
-- Deze migratie voegt drie dingen toe:
--   1. `relatie_bouw7_koppelingen` — één EVA-relatie houdt N Bouw7-spiegels vast, één per rol.
--      Dít maakt samenvoegen duurzaam: zonder spiegeltabel herkent de sync de verdwenen
--      `bouw7_id` niet meer en maakt hij de zojuist samengevoegde rij binnen een halve dag
--      gewoon opnieuw aan. Dezelfde les als bij de contactpersonen (20260920l).
--   2. Samenvoeg-administratie op `relaties` plus een logtabel, zodat het terug te draaien is.
--   3. `relatie_samenvoegen` / `relatie_samenvoegen_ongedaan` als transactie.
--
-- Volledig additief: `relaties.bouw7_id` blijft de primaire spiegel en blijft gevuld, dus de
-- code die nu in productie draait merkt hier niets van.

-- ─── 1. Spiegeltabel: Bouw7-contacten per EVA-relatie ────────────────────────

create table if not exists public.relatie_bouw7_koppelingen (
  id                uuid        primary key default gen_random_uuid(),
  relatie_id        uuid        not null references public.relaties(id) on delete cascade,
  -- Het contact-id in Bouw7. Uniek: één Bouw7-contact hoort bij precies één EVA-relatie.
  bouw7_id          text        not null unique,
  -- De rol waarin Bouw7 dit contact kent ('opdrachtgever' | 'leverancier' | 'onderaannemer').
  -- Hierop kiest de schrijfkant naar welke spiegel een dossier of inkooporder moet: een
  -- verkooporder hoort bij de opdrachtgever-spiegel, een bestelling bij de leverancier-spiegel.
  bouw7_type        text,
  -- Per spiegel, niet per relatie: twee Bouw7-contacten wijzigen onafhankelijk van elkaar.
  bouw7_sync_hash   text,
  bouw7_laatst_sync timestamptz,
  -- De spiegel waarnaar EVA standaard terugschrijft en die `relaties.bouw7_id` vult.
  is_primair        boolean     not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists relatie_b7_koppeling_relatie_idx
  on public.relatie_bouw7_koppelingen (relatie_id);
create index if not exists relatie_b7_koppeling_type_idx
  on public.relatie_bouw7_koppelingen (relatie_id, bouw7_type);
-- Hoogstens één primaire spiegel per relatie.
create unique index if not exists relatie_b7_koppeling_primair_idx
  on public.relatie_bouw7_koppelingen (relatie_id) where is_primair;

comment on table public.relatie_bouw7_koppelingen is
  'Bouw7-spiegels per EVA-relatie. Bouw7 dupliceert een bedrijf per rol (klant/leverancier/onderaannemer); EVA houdt één relatie met N spiegels.';

-- Backfill: elke bestaande relatie met een bouw7_id krijgt zijn primaire spiegel, inclusief
-- de hash zodat de eerste incrementele sync na deze migratie niets overbodig doet.
insert into public.relatie_bouw7_koppelingen
  (relatie_id, bouw7_id, bouw7_type, bouw7_sync_hash, bouw7_laatst_sync, is_primair)
select r.id, r.bouw7_id, r.bouw7_type, r.bouw7_sync_hash, r.bouw7_laatst_sync, true
from public.relaties r
where r.bouw7_id is not null
on conflict (bouw7_id) do nothing;

alter table public.relatie_bouw7_koppelingen enable row level security;
-- Geen policies: uitsluitend server-side via de service-role admin-client, net als
-- contactpersoon_bouw7_koppelingen. De authenticated-baseline werkt op een vaste tabellijst.

-- ─── 2. Samenvoeg-administratie ──────────────────────────────────────────────

alter table public.relaties
  -- Niet verwijderen maar doorverwijzen: dossiers, facturen en notities hebben de oude rij
  -- ooit aangewezen, en `dossiers_klant_id_fkey` staat sowieso op ON DELETE NO ACTION.
  add column if not exists samengevoegd_in   uuid references public.relaties(id) on delete set null,
  add column if not exists samengevoegd_op   timestamptz,
  add column if not exists samengevoegd_door uuid references auth.users(id);

create index if not exists relaties_samengevoegd_idx
  on public.relaties (samengevoegd_in) where samengevoegd_in is not null;

create table if not exists public.relatie_samenvoegingen (
  id           uuid        primary key default gen_random_uuid(),
  blijver_id   uuid        not null references public.relaties(id) on delete cascade,
  verliezer_id uuid        not null references public.relaties(id) on delete cascade,
  -- Alles wat is verplaatst, per stap, zodat het terugdraaien het exact kan terugzetten in
  -- plaats van te moeten raden.
  verplaatst   jsonb       not null default '{}'::jsonb,
  door         uuid        references auth.users(id),
  teruggedraaid_op timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists relatie_samenvoeging_verliezer_idx
  on public.relatie_samenvoegingen (verliezer_id);

alter table public.relatie_samenvoegingen enable row level security;

-- ─── 3. Samenvoegen als transactie ───────────────────────────────────────────

create or replace function public.relatie_samenvoegen(
  p_blijver   uuid,
  p_verliezer uuid,
  p_door      uuid default null
) returns uuid
language plpgsql
as $$
declare
  -- Velden van de blijver die uit de verliezer worden aangevuld als ze leeg zijn. De blijver
  -- wint altijd; er wordt nooit iets overschreven.
  k_velden constant text[] := array[
    'kvk_nummer','btw_nummer','email','telefoon','mobiel','website',
    'adres_straat','adres_postcode','adres_plaats','adres_land',
    'opmerkingen','betalingstermijn_dagen'
  ];
  v_kol        text;
  v_aantal     int;
  v_aangevuld  text[] := '{}';
  v_types_voor text[];
  v_hv_voor    text[];
  v_spiegels   uuid[];
  v_tabel      text;
  v_kolom      text;
  v_id         uuid;
  v_rij        jsonb;
  v_ids        uuid[];
  v_weg        jsonb;
  v_fk         jsonb := '{}'::jsonb;
  v_verwijderd jsonb := '{}'::jsonb;
  v_ketens     uuid[];
  v_verplaatst jsonb;
  v_log        uuid;
begin
  if p_blijver = p_verliezer then
    raise exception 'Blijver en verliezer zijn dezelfde relatie';
  end if;
  perform 1 from public.relaties where id = p_blijver for update;
  if not found then raise exception 'Blijver bestaat niet'; end if;
  perform 1 from public.relaties where id = p_verliezer for update;
  if not found then raise exception 'Verliezer bestaat niet'; end if;
  perform 1 from public.relaties where id = p_blijver and samengevoegd_in is not null;
  if found then raise exception 'De blijver is zelf al samengevoegd in een andere relatie'; end if;
  perform 1 from public.relaties where id = p_verliezer and samengevoegd_in is not null;
  if found then raise exception 'Deze relatie is al samengevoegd'; end if;

  -- 3a. Lege velden van de blijver aanvullen uit de verliezer. Dynamisch omdat we per veld
  --     willen onthouden of het is aangevuld — anders kan het terugdraaien dat niet ongedaan
  --     maken. De ::text-cast maakt de leegtest ook geldig voor `betalingstermijn_dagen` (int).
  foreach v_kol in array k_velden loop
    execute format(
      'update public.relaties b set %1$I = v.%1$I from public.relaties v
         where b.id = $1 and v.id = $2
           and nullif(b.%1$I::text, '''') is null
           and nullif(v.%1$I::text, '''') is not null',
      v_kol
    ) using p_blijver, p_verliezer;
    get diagnostics v_aantal = row_count;
    if v_aantal > 0 then v_aangevuld := v_aangevuld || v_kol; end if;
  end loop;

  -- 3b. Rollen samenvoegen — dit is de kern. Een bedrijf dat in Bouw7 als klant én als
  --     leverancier staat, wordt in EVA één relatie met beide types. Hetzelfde voor
  --     `handmatige_velden`: wat aan één kant met de hand is ingevuld moet beschermd blijven.
  select types, handmatige_velden into v_types_voor, v_hv_voor
    from public.relaties where id = p_blijver;

  update public.relaties b
     set types = (select array_agg(distinct t order by t)
                    from unnest(b.types || v.types) t),
         handmatige_velden = (select coalesce(array_agg(distinct h order by h), '{}')
                                from unnest(b.handmatige_velden || v.handmatige_velden) h)
    from public.relaties v
   where b.id = p_blijver and v.id = p_verliezer;

  -- 3c. Bouw7-spiegels overzetten. Ze verliezen hun primair-vlag: de blijver heeft de zijne al.
  with verhuisd as (
    update public.relatie_bouw7_koppelingen
       set relatie_id = p_blijver, is_primair = false
     where relatie_id = p_verliezer
     returning id
  ) select coalesce(array_agg(id), '{}') into v_spiegels from verhuisd;

  -- Heeft de blijver nog geen primaire spiegel (EVA-eigen relatie), dan wordt de oudste
  -- overgezette spiegel dat.
  if not exists (select 1 from public.relatie_bouw7_koppelingen
                  where relatie_id = p_blijver and is_primair) then
    update public.relatie_bouw7_koppelingen
       set is_primair = true
     where id = (select id from public.relatie_bouw7_koppelingen
                  where relatie_id = p_blijver order by created_at limit 1);
  end if;

  -- `relaties.bouw7_id` blijft de spiegeling van de primaire koppeling.
  update public.relaties r
     set bouw7_id = k.bouw7_id, bouw7_type = coalesce(r.bouw7_type, k.bouw7_type)
    from public.relatie_bouw7_koppelingen k
   where r.id = p_blijver and k.relatie_id = p_blijver and k.is_primair
     and r.bouw7_id is null;

  -- 3d. Alles wat naar de verliezer wees omhangen naar de blijver. De lijst komt uit de
  --     FK-catalogus in plaats van uit een hardgecodeerde opsomming: er wijzen dertig
  --     kolommen naar `relaties` en dat worden er meer. Een nieuwe tabel doet vanzelf mee.
  --     `relaties` zelf en de spiegeltabel staan er niet bij — die zijn hierboven al gedaan.
  for v_tabel, v_kolom in
    select cl.relname, a.attname
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace and ns.nspname = 'public'
      cross join lateral (
        select at.attname from unnest(c.conkey) k
          join pg_attribute at on at.attrelid = c.conrelid and at.attnum = k limit 1
      ) a
     where c.contype = 'f'
       and c.confrelid = 'public.relaties'::regclass
       and array_length(c.conkey, 1) = 1
       and cl.relname not in ('relaties', 'relatie_bouw7_koppelingen', 'relatie_samenvoegingen')
     order by cl.relname, a.attname
  loop
    v_ids := '{}';
    v_weg := '[]'::jsonb;
    -- Rij voor rij: zes van deze tabellen hebben een unieke sleutel waar de relatie in zit
    -- (relatie_bankgegevens, relatie_facturatie en relatie_inkoop zijn 1-op-1; uurtarieven,
    -- vastgoed_object_relaties en contactpersoon_organisaties zijn uniek per combinatie).
    -- Heeft de blijver die rij al, dan botst de verhuizing. Die rij van de verliezer gaat
    -- dan weg, maar wordt volledig bewaard zodat het terugdraaien hem kan herplaatsen.
    for v_id in execute format('select id from public.%I where %I = $1 order by id', v_tabel, v_kolom)
                using p_verliezer
    loop
      begin
        execute format('update public.%I set %I = $1 where id = $2', v_tabel, v_kolom)
          using p_blijver, v_id;
        v_ids := v_ids || v_id;
      exception when unique_violation then
        execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_tabel)
          into v_rij using v_id;
        execute format('delete from public.%I where id = $1', v_tabel) using v_id;
        v_weg := v_weg || v_rij;
      end;
    end loop;
    if array_length(v_ids, 1) > 0 then
      v_fk := v_fk || jsonb_build_object(v_tabel,
                jsonb_build_object('kolom', v_kolom, 'ids', to_jsonb(v_ids)));
    end if;
    if jsonb_array_length(v_weg) > 0 then
      v_verwijderd := v_verwijderd || jsonb_build_object(v_tabel, v_weg);
    end if;
  end loop;

  -- 3e. Ketens: relaties die eerder in de verliezer zijn samengevoegd wijzen nu door naar de
  --     blijver, anders verwijst hun historie naar een rij die zelf is opgegaan in een andere.
  with keten as (
    update public.relaties set samengevoegd_in = p_blijver
     where samengevoegd_in = p_verliezer returning id
  ) select coalesce(array_agg(id), '{}') into v_ketens from keten;

  -- 3f. De verliezer blijft staan als doorverwijzing, maar valt overal uit de lijsten.
  update public.relaties
     set samengevoegd_in = p_blijver,
         samengevoegd_op = now(),
         samengevoegd_door = p_door,
         actief = false,
         bouw7_id = null              -- de spiegel is verhuisd; de unieke index moet vrij zijn
   where id = p_verliezer;

  v_verplaatst := jsonb_build_object(
    'aangevuld',  to_jsonb(v_aangevuld),
    'types_voor', to_jsonb(v_types_voor),
    'hv_voor',    to_jsonb(coalesce(v_hv_voor, '{}'::text[])),
    'spiegels',   to_jsonb(v_spiegels),
    'verwijzingen', v_fk,
    'verwijderd', v_verwijderd,
    'ketens',     to_jsonb(v_ketens)
  );

  insert into public.relatie_samenvoegingen (blijver_id, verliezer_id, verplaatst, door)
  values (p_blijver, p_verliezer, v_verplaatst, p_door)
  returning id into v_log;

  return v_log;
end;
$$;

comment on function public.relatie_samenvoegen(uuid, uuid, uuid) is
  'Voegt twee relaties samen in één transactie: rollen worden verenigd, lege velden aangevuld, spiegels en verwijzingen verhuisd. Retourneert het log-id voor het terugdraaien.';

-- Terugdraaien op basis van het log. Alleen wat deze samenvoeging heeft verplaatst gaat terug;
-- wijzigingen van daarna blijven staan (die horen inmiddels bij de blijver).
create or replace function public.relatie_samenvoegen_ongedaan(p_log uuid)
returns void
language plpgsql
as $$
declare
  v_log   public.relatie_samenvoegingen;
  v_kol   text;
  v_tabel text;
  v_item  jsonb;
  v_rij   jsonb;
begin
  select * into v_log from public.relatie_samenvoegingen where id = p_log for update;
  if not found then raise exception 'Samenvoeging niet gevonden'; end if;
  if v_log.teruggedraaid_op is not null then raise exception 'Deze samenvoeging is al teruggedraaid'; end if;

  -- Aangevulde velden weer leegmaken: ze kwamen van de verliezer en gaan met hem mee terug.
  for v_kol in select jsonb_array_elements_text(v_log.verplaatst -> 'aangevuld') loop
    execute format('update public.relaties set %I = null where id = $1', v_kol) using v_log.blijver_id;
  end loop;

  -- Rollen en handmatige velden terug naar wat de blijver vóór de samenvoeging had.
  update public.relaties
     set types = coalesce((select array_agg(x) from jsonb_array_elements_text(
                             coalesce(v_log.verplaatst -> 'types_voor', '[]'::jsonb)) x), types),
         handmatige_velden = coalesce((select array_agg(x) from jsonb_array_elements_text(
                             coalesce(v_log.verplaatst -> 'hv_voor', '[]'::jsonb)) x), '{}')
   where id = v_log.blijver_id;

  update public.relatie_bouw7_koppelingen
     set relatie_id = v_log.verliezer_id
   where id in (select x::uuid from jsonb_array_elements_text(
                  coalesce(v_log.verplaatst -> 'spiegels', '[]'::jsonb)) x);

  -- Verhuisde verwijzingen terug.
  for v_tabel, v_item in select key, value from jsonb_each(
      coalesce(v_log.verplaatst -> 'verwijzingen', '{}'::jsonb)) loop
    execute format(
      'update public.%I set %I = $1 where id in (select x::uuid from jsonb_array_elements_text($2) x)',
      v_tabel, v_item ->> 'kolom'
    ) using v_log.verliezer_id, v_item -> 'ids';
  end loop;

  -- Rijen die moesten wijken voor een unieke sleutel weer terugzetten, met hun oude id.
  for v_tabel, v_item in select key, value from jsonb_each(
      coalesce(v_log.verplaatst -> 'verwijderd', '{}'::jsonb)) loop
    for v_rij in select * from jsonb_array_elements(v_item) loop
      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)
           on conflict (id) do nothing', v_tabel, v_tabel
      ) using v_rij;
    end loop;
  end loop;

  update public.relaties set samengevoegd_in = v_log.verliezer_id
   where id in (select x::uuid from jsonb_array_elements_text(
                  coalesce(v_log.verplaatst -> 'ketens', '[]'::jsonb)) x);

  update public.relaties
     set samengevoegd_in = null, samengevoegd_op = null, samengevoegd_door = null, actief = true,
         bouw7_id = (select bouw7_id from public.relatie_bouw7_koppelingen
                      where relatie_id = v_log.verliezer_id order by created_at limit 1)
   where id = v_log.verliezer_id;

  -- De verliezer krijgt zijn primaire spiegel terug; de blijver houdt de zijne.
  update public.relatie_bouw7_koppelingen set is_primair = true
   where id = (select id from public.relatie_bouw7_koppelingen
                where relatie_id = v_log.verliezer_id order by created_at limit 1)
     and not exists (select 1 from public.relatie_bouw7_koppelingen
                      where relatie_id = v_log.verliezer_id and is_primair);

  update public.relatie_samenvoegingen set teruggedraaid_op = now() where id = p_log;
end;
$$;

-- Beide functies draaien als de aanroeper (geen SECURITY DEFINER) en zijn daarmee alleen
-- bruikbaar met de service-role client uit de server-actions, die zelf op het recht `relaties`
-- gaten. `from public` is niet genoeg: Supabase' default privileges geven `anon` en
-- `authenticated` execute op elke nieuwe functie.
revoke all on function public.relatie_samenvoegen(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.relatie_samenvoegen_ongedaan(uuid) from public, anon, authenticated;
grant execute on function public.relatie_samenvoegen(uuid, uuid, uuid) to service_role;
grant execute on function public.relatie_samenvoegen_ongedaan(uuid) to service_role;

-- ─── 4. Grendel tegen terugkerende duplicaten ────────────────────────────────
--
-- Aanleiding is de uitrolvolgorde: de samenvoegingen staan in de database zodra ze gedaan zijn,
-- maar `syncContacts` sleutelt pas op `relatie_bouw7_koppelingen` zodra die code is uitgerold.
-- Draait de oude code nog, dan vindt hij de bouw7_id van een samengevoegde verliezer niet meer
-- terug in `relaties` en maakt hij hem als nieuwe relatie aan — het duplicaat staat er dan
-- binnen een halve dag weer.
--
-- De grendel blijft daarna staan als invariant: de spiegeltabel is dé sleutel, dus twee
-- relaties met hetzelfde Bouw7-contact mag sowieso niet kunnen. `relaties.bouw7_id` heeft een
-- partiële unique index, maar die helpt hier niet: de verliezer heeft dat veld juist leeg.
create or replace function public.relatie_geen_dubbele_bouw7_insert()
returns trigger
language plpgsql
as $$
declare
  v_bestaand uuid;
begin
  if new.bouw7_id is null then return new; end if;

  select relatie_id into v_bestaand
    from public.relatie_bouw7_koppelingen
   where bouw7_id = new.bouw7_id;

  -- Hoort dit Bouw7-contact al bij een andere EVA-relatie, dan is deze insert de terugkeer van
  -- een opgeruimd duplicaat. Stilletjes overslaan: de bestaande relatie klopt al.
  if v_bestaand is not null and v_bestaand is distinct from new.id then
    raise warning 'Bouw7-contact % hangt al aan relatie % — insert van "%" overgeslagen',
      new.bouw7_id, v_bestaand, new.naam;
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists relatie_geen_dubbele_bouw7_insert on public.relaties;
create trigger relatie_geen_dubbele_bouw7_insert
  before insert on public.relaties
  for each row execute function public.relatie_geen_dubbele_bouw7_insert();
