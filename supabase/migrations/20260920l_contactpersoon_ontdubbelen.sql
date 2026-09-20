-- =====================================================================
-- Contactpersonen ontdubbelen: één mens, meerdere bedrijven
-- =====================================================================
--
-- Bouw7 kan een contactpersoon maar aan één contact (relatie) hangen. Werkt iemand voor twee
-- bedrijven, dan staat hij daar twee keer — en die twee rijen kwamen één-op-één EVA binnen,
-- omdat de sync `contactpersonen.bouw7_id` als sleutel gebruikt en die kolom er maar één kan
-- bevatten. EVA's datamodel kan het wél aan (`contactpersoon_organisaties` is n-op-n), maar
-- in september 2026 had geen enkele van de 350 contactpersonen meer dan één organisatie,
-- terwijl er 21 dubbele e-mailadressen en 24 dubbele namen stonden.
--
-- Deze migratie voegt vier dingen toe:
--   1. `contactpersoon_bouw7_koppelingen` — één EVA-persoon houdt N Bouw7-spiegels vast, één
--      per bedrijf. Dít is wat samenvoegen duurzaam maakt: de sync herkent een Bouw7-cp
--      voortaan via de spiegel en maakt de zojuist samengevoegde rij niet opnieuw aan.
--   2. Samenvoeg-administratie op `contactpersonen` (`samengevoegd_in`) plus een logtabel,
--      zodat een samenvoeging terug te draaien is.
--   3. Zakelijke contactgegevens per koppeling: een mens kan bij bedrijf A een ander
--      e-mailadres hebben dan bij bedrijf B. Zonder dat veld moet je bij het samenvoegen
--      kiezen welk adres wint en ben je het andere kwijt.
--   4. `soort` op de persoon: Bouw7 bevat "contactpersonen" die geen mens zijn
--      (gedeelde postbussen als crediteuren@…, en VvE's die als contactpersoon staan
--      geregistreerd). Die mogen nooit als dubbel worden voorgesteld.
--
-- Volledig additief: de bestaande kolom `contactpersonen.bouw7_id` blijft de primaire spiegel
-- en blijft gevuld, dus de code die nu in productie draait merkt hier niets van.

-- ─── 1. Spiegeltabel: Bouw7-contactpersonen per EVA-persoon ──────────────────

create table if not exists public.contactpersoon_bouw7_koppelingen (
  id                uuid        primary key default gen_random_uuid(),
  contactpersoon_id uuid        not null references public.contactpersonen(id) on delete cascade,
  -- Het id van de contactpersoon in Bouw7. Uniek: één Bouw7-rij hoort bij precies één mens.
  bouw7_id          text        not null unique,
  -- Het Bouw7-contact (de relatie) waaronder deze spiegel hangt. Nodig om naar de juiste
  -- `POST /contact/{contact}/contact-person` te schrijven.
  bouw7_contact_id  text,
  organisatie_id    uuid        references public.relaties(id) on delete set null,
  -- Per spiegel, niet per persoon: twee spiegels wijzigen onafhankelijk van elkaar.
  bouw7_sync_hash   text,
  bouw7_laatst_sync timestamptz,
  -- De spiegel waarnaar EVA standaard terugschrijft en die `contactpersonen.bouw7_id` vult.
  is_primair        boolean     not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists cp_b7_koppeling_persoon_idx
  on public.contactpersoon_bouw7_koppelingen (contactpersoon_id);
create index if not exists cp_b7_koppeling_contact_idx
  on public.contactpersoon_bouw7_koppelingen (bouw7_contact_id);
-- Hoogstens één primaire spiegel per mens.
create unique index if not exists cp_b7_koppeling_primair_idx
  on public.contactpersoon_bouw7_koppelingen (contactpersoon_id) where is_primair;

comment on table public.contactpersoon_bouw7_koppelingen is
  'Bouw7-spiegels per EVA-contactpersoon. Bouw7 dupliceert een mens per bedrijf; EVA houdt één persoon met N spiegels.';

-- Backfill: elke bestaande contactpersoon met een bouw7_id krijgt zijn primaire spiegel,
-- inclusief de hash zodat de eerste incrementele sync na deze migratie niets overbodig doet.
insert into public.contactpersoon_bouw7_koppelingen
  (contactpersoon_id, bouw7_id, bouw7_contact_id, organisatie_id, bouw7_sync_hash, bouw7_laatst_sync, is_primair)
select
  cp.id,
  cp.bouw7_id,
  r.bouw7_id,
  co.organisatie_id,
  cp.bouw7_sync_hash,
  cp.bouw7_laatst_sync,
  true
from public.contactpersonen cp
left join lateral (
  select co.organisatie_id
  from public.contactpersoon_organisaties co
  where co.contactpersoon_id = cp.id
  order by co.is_primair desc, co.created_at
  limit 1
) co on true
left join public.relaties r on r.id = co.organisatie_id
where cp.bouw7_id is not null
on conflict (bouw7_id) do nothing;

alter table public.contactpersoon_bouw7_koppelingen enable row level security;
-- Geen policies: uitsluitend server-side via de service-role admin-client, net als
-- relatie_notities (20260920a). De authenticated-baseline werkt op een vaste tabellijst.

-- ─── 2. Samenvoeg-administratie ──────────────────────────────────────────────

alter table public.contactpersonen
  -- Niet verwijderen maar doorverwijzen: dossiers, notities en mailintake hebben de oude rij
  -- ooit aangewezen, en een harde delete zou die historie stilzwijgend op null zetten.
  add column if not exists samengevoegd_in  uuid references public.contactpersonen(id) on delete set null,
  add column if not exists samengevoegd_op  timestamptz,
  add column if not exists samengevoegd_door uuid references auth.users(id),
  -- 'persoon' | 'postbus' (crediteuren@, info@) | 'object' (een VvE die als cp staat geregistreerd)
  add column if not exists soort            text not null default 'persoon';

do $$ begin
  alter table public.contactpersonen
    add constraint contactpersonen_soort_check check (soort in ('persoon', 'postbus', 'object'));
exception when duplicate_object then null; end $$;

create index if not exists contactpersonen_samengevoegd_idx
  on public.contactpersonen (samengevoegd_in) where samengevoegd_in is not null;

create table if not exists public.contactpersoon_samenvoegingen (
  id           uuid        primary key default gen_random_uuid(),
  blijver_id   uuid        not null references public.contactpersonen(id) on delete cascade,
  verliezer_id uuid        not null references public.contactpersonen(id) on delete cascade,
  -- Alles wat is verplaatst, per stap, zodat `contactpersoon_samenvoegen_ongedaan` het
  -- exact kan terugzetten in plaats van te moeten raden.
  verplaatst   jsonb       not null default '{}'::jsonb,
  door         uuid        references auth.users(id),
  teruggedraaid_op timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists cp_samenvoeging_verliezer_idx
  on public.contactpersoon_samenvoegingen (verliezer_id);

alter table public.contactpersoon_samenvoegingen enable row level security;

-- ─── 3. Zakelijke contactgegevens per koppeling ──────────────────────────────

alter table public.contactpersoon_organisaties
  -- Leeg = gebruik het adres van de persoon zelf. Gevuld = dit geldt bij déze organisatie.
  add column if not exists email    text,
  add column if not exists telefoon text,
  add column if not exists mobiel   text,
  -- Zelfde bescherming als `handmatige_velden` op contactpersonen/relaties: wat in EVA is
  -- ingevuld mag de sync niet terugzetten. `functie_handmatig` blijft apart (bestaande kolom).
  add column if not exists handmatige_velden text[] not null default '{}'::text[];

-- ─── 4. Samenvoegen als transactie ───────────────────────────────────────────

-- Velden van de blijver die uit de verliezer worden aangevuld als ze leeg zijn. De blijver
-- wint altijd; er wordt nooit iets overschreven.
create or replace function public.contactpersoon_samenvoegen(
  p_blijver   uuid,
  p_verliezer uuid,
  p_door      uuid default null
) returns uuid
language plpgsql
as $$
declare
  k_velden constant text[] := array[
    'aanhef','geslacht','voorletter','tussenvoegsel','email','telefoon','mobiel','linkedin_url',
    'prive_email','prive_telefoon','prive_adres_straat','prive_adres_postcode','prive_adres_plaats',
    'geboortedatum','opmerkingen'
  ];
  v_kol        text;
  v_aantal     int;
  v_aangevuld  text[] := '{}';
  v_spiegels   uuid[];
  v_koppels    uuid[];
  v_dubbele    jsonb;
  v_verplaatst jsonb := '{}'::jsonb;
  v_tabel      text;
  v_kolom      text;
  v_ids        uuid[];
  v_fk         jsonb := '{}'::jsonb;
  v_log        uuid;
begin
  if p_blijver = p_verliezer then
    raise exception 'Blijver en verliezer zijn dezelfde contactpersoon';
  end if;
  perform 1 from public.contactpersonen where id = p_blijver for update;
  if not found then raise exception 'Blijver bestaat niet'; end if;
  perform 1 from public.contactpersonen where id = p_verliezer for update;
  if not found then raise exception 'Verliezer bestaat niet'; end if;
  perform 1 from public.contactpersonen where id = p_blijver and samengevoegd_in is not null;
  if found then raise exception 'De blijver is zelf al samengevoegd in een andere persoon'; end if;
  perform 1 from public.contactpersonen where id = p_verliezer and samengevoegd_in is not null;
  if found then raise exception 'Deze contactpersoon is al samengevoegd'; end if;

  -- 4a. Lege velden van de blijver aanvullen uit de verliezer. Dynamisch omdat we per veld
  --     willen onthouden of het is aangevuld — anders kan het terugdraaien dat niet ongedaan
  --     maken. De ::text-cast maakt de leegtest ook geldig voor `geboortedatum` (date).
  foreach v_kol in array k_velden loop
    execute format(
      'update public.contactpersonen b set %1$I = v.%1$I from public.contactpersonen v
         where b.id = $1 and v.id = $2
           and nullif(b.%1$I::text, '''') is null
           and nullif(v.%1$I::text, '''') is not null',
      v_kol
    ) using p_blijver, p_verliezer;
    get diagnostics v_aantal = row_count;
    if v_aantal > 0 then v_aangevuld := v_aangevuld || v_kol; end if;
  end loop;

  -- 4b. Bouw7-spiegels overzetten. Ze verliezen hun primair-vlag: de blijver heeft de zijne al.
  with verhuisd as (
    update public.contactpersoon_bouw7_koppelingen
       set contactpersoon_id = p_blijver, is_primair = false
     where contactpersoon_id = p_verliezer
     returning id
  ) select coalesce(array_agg(id), '{}') into v_spiegels from verhuisd;

  -- Heeft de blijver nog geen primaire spiegel (EVA-eigen persoon), dan wordt de eerste
  -- overgezette spiegel dat, inclusief de spiegeling in contactpersonen.bouw7_id.
  if not exists (select 1 from public.contactpersoon_bouw7_koppelingen
                  where contactpersoon_id = p_blijver and is_primair) then
    update public.contactpersoon_bouw7_koppelingen
       set is_primair = true
     where id = (select id from public.contactpersoon_bouw7_koppelingen
                  where contactpersoon_id = p_blijver order by created_at limit 1);
  end if;

  -- 4c. Organisatiekoppelingen. Hangt de blijver al aan dezelfde organisatie, dan botst de
  --     unieke (contactpersoon_id, organisatie_id) — die koppeling van de verliezer gaat weg,
  --     maar wordt volledig bewaard zodat het terugdraaien hem kan herplaatsen.
  with dubbel as (
    delete from public.contactpersoon_organisaties co
     where co.contactpersoon_id = p_verliezer
       and exists (select 1 from public.contactpersoon_organisaties b
                    where b.contactpersoon_id = p_blijver and b.organisatie_id = co.organisatie_id)
     returning co.*
  ) select coalesce(jsonb_agg(to_jsonb(dubbel)), '[]'::jsonb) into v_dubbele from dubbel;

  with verhuisd as (
    update public.contactpersoon_organisaties
       set contactpersoon_id = p_blijver
     where contactpersoon_id = p_verliezer
     returning id
  ) select coalesce(array_agg(id), '{}') into v_koppels from verhuisd;

  -- 4d. Alles wat naar de verliezer wees omhangen naar de blijver.
  for v_tabel, v_kolom in
    select * from (values
      ('dossiers',             'contactpersoon_id'),
      ('mailintake_aliassen',  'contactpersoon_id'),
      ('mailintake_berichten', 'contactpersoon_id'),
      ('portaal_gebruikers',   'contactpersoon_id'),
      ('relatie_notities',     'contactpersoon_id'),
      ('vastgoed_objecten',    'standaard_contactpersoon_id')
    ) as t(tabel, kolom)
  loop
    execute format(
      'with verhuisd as (update public.%I set %I = $1 where %I = $2 returning id)
         select coalesce(array_agg(id), ''{}'') from verhuisd',
      v_tabel, v_kolom, v_kolom
    ) into v_ids using p_blijver, p_verliezer;
    if array_length(v_ids, 1) > 0 then
      v_fk := v_fk || jsonb_build_object(v_tabel, jsonb_build_object('kolom', v_kolom, 'ids', to_jsonb(v_ids)));
    end if;
  end loop;

  -- 4e. De verliezer blijft staan als doorverwijzing, maar valt overal uit de lijsten.
  update public.contactpersonen
     set samengevoegd_in = p_blijver,
         samengevoegd_op = now(),
         samengevoegd_door = p_door,
         actief = false,
         bouw7_id = null              -- de spiegel is verhuisd; de unieke index moet vrij zijn
   where id = p_verliezer;

  v_verplaatst := jsonb_build_object(
    'aangevuld', to_jsonb(v_aangevuld),
    'spiegels',  to_jsonb(v_spiegels),
    'koppels',   to_jsonb(v_koppels),
    'dubbele_koppels', v_dubbele,
    'verwijzingen', v_fk
  );

  insert into public.contactpersoon_samenvoegingen (blijver_id, verliezer_id, verplaatst, door)
  values (p_blijver, p_verliezer, v_verplaatst, p_door)
  returning id into v_log;

  return v_log;
end;
$$;

comment on function public.contactpersoon_samenvoegen(uuid, uuid, uuid) is
  'Voegt twee contactpersonen samen in één transactie. De blijver wint; lege velden worden aangevuld. Retourneert het log-id voor het terugdraaien.';

-- Terugdraaien op basis van het log. Alleen wat deze samenvoeging heeft verplaatst gaat terug;
-- wijzigingen van daarna blijven staan (die horen inmiddels bij de blijver).
create or replace function public.contactpersoon_samenvoegen_ongedaan(p_log uuid)
returns void
language plpgsql
as $$
declare
  v_log   public.contactpersoon_samenvoegingen;
  v_kol   text;
  v_tabel text;
  v_item  jsonb;
  v_rij   jsonb;
begin
  select * into v_log from public.contactpersoon_samenvoegingen where id = p_log for update;
  if not found then raise exception 'Samenvoeging niet gevonden'; end if;
  if v_log.teruggedraaid_op is not null then raise exception 'Deze samenvoeging is al teruggedraaid'; end if;

  -- Aangevulde velden weer leegmaken: ze kwamen van de verliezer en gaan met hem mee terug.
  for v_kol in select jsonb_array_elements_text(v_log.verplaatst -> 'aangevuld') loop
    execute format('update public.contactpersonen set %I = null where id = $1', v_kol) using v_log.blijver_id;
  end loop;

  update public.contactpersoon_bouw7_koppelingen
     set contactpersoon_id = v_log.verliezer_id
   where id in (select x::uuid from jsonb_array_elements_text(coalesce(v_log.verplaatst -> 'spiegels', '[]'::jsonb)) x);

  update public.contactpersoon_organisaties
     set contactpersoon_id = v_log.verliezer_id
   where id in (select x::uuid from jsonb_array_elements_text(coalesce(v_log.verplaatst -> 'koppels', '[]'::jsonb)) x);

  for v_rij in select * from jsonb_array_elements(coalesce(v_log.verplaatst -> 'dubbele_koppels', '[]'::jsonb)) loop
    insert into public.contactpersoon_organisaties
      (id, contactpersoon_id, organisatie_id, functie, is_primair, opmerkingen, created_at, functie_handmatig, email, telefoon, mobiel, handmatige_velden)
    select
      (v_rij ->> 'id')::uuid, (v_rij ->> 'contactpersoon_id')::uuid, (v_rij ->> 'organisatie_id')::uuid,
      v_rij ->> 'functie', coalesce((v_rij ->> 'is_primair')::boolean, false), v_rij ->> 'opmerkingen',
      coalesce((v_rij ->> 'created_at')::timestamptz, now()), coalesce((v_rij ->> 'functie_handmatig')::boolean, false),
      v_rij ->> 'email', v_rij ->> 'telefoon', v_rij ->> 'mobiel',
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_rij -> 'handmatige_velden', '[]'::jsonb)) x), '{}')
    on conflict (id) do nothing;
  end loop;

  for v_tabel, v_item in select key, value from jsonb_each(coalesce(v_log.verplaatst -> 'verwijzingen', '{}'::jsonb)) loop
    execute format(
      'update public.%I set %I = $1 where id in (select x::uuid from jsonb_array_elements_text($2) x)',
      v_tabel, v_item ->> 'kolom'
    ) using v_log.verliezer_id, v_item -> 'ids';
  end loop;

  update public.contactpersonen
     set samengevoegd_in = null, samengevoegd_op = null, samengevoegd_door = null, actief = true,
         bouw7_id = (select bouw7_id from public.contactpersoon_bouw7_koppelingen
                      where contactpersoon_id = v_log.verliezer_id order by created_at limit 1)
   where id = v_log.verliezer_id;

  update public.contactpersoon_samenvoegingen set teruggedraaid_op = now() where id = p_log;
end;
$$;

-- Beide functies draaien als de aanroeper (geen SECURITY DEFINER) en zijn daarmee alleen
-- bruikbaar met de service-role client uit de server-actions, die zelf op het recht
-- `relaties` gaten. Voor `authenticated` is er niets te halen: RLS blokkeert de tabellen.
-- `from public` is niet genoeg: Supabase' default privileges geven `anon` en `authenticated`
-- execute op elke nieuwe functie. Zonder die tweede revoke blijft de RPC aanroepbaar (RLS
-- houdt hem tegen, maar dat is een tweede slot, geen eerste).
revoke all on function public.contactpersoon_samenvoegen(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.contactpersoon_samenvoegen_ongedaan(uuid) from public, anon, authenticated;
grant execute on function public.contactpersoon_samenvoegen(uuid, uuid, uuid) to service_role;
grant execute on function public.contactpersoon_samenvoegen_ongedaan(uuid) to service_role;
