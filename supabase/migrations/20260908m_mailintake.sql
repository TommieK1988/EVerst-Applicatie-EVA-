-- Mailintake — offerteaanvragen, opdrachten en servicedeskbonnen uit e-mail.
--
-- Drie gedeelde postbussen worden elke 10 minuten uitgelezen. Per bericht:
-- eerst triage (is dit überhaupt werk?), dan AI-extractie, dan een besluit.
-- Bij ELKE twijfel gaat een bericht naar een mens; automatisch aanmaken is de
-- uitzondering die aan alle voorwaarden moet voldoen (zie lib/mailintake/beslis.ts).
--
-- De bron van waarheid is deze tabel, niet Outlook. `internet_message_id` is de
-- sleutel: het Graph-id verandert zodra een bericht wordt verplaatst — ook door
-- onze eigen nabehandeling.

-- ── 1. Postbussen ───────────────────────────────────────────────────────────
create table if not exists public.mailintake_postbussen (
  id                            uuid primary key default gen_random_uuid(),
  sleutel                       text not null unique,
  naam                          text not null,
  adres                         text not null,
  soort                         text not null check (soort in ('offerteaanvraag','opdracht','servicedesk')),
  map_id                        text not null default 'inbox',
  actief                        boolean not null default false,
  -- Fase 2-schakelaar. Staat bewust uit: fase 1 legt alles voor aan een mens.
  automatisch_aanmaken          boolean not null default false,
  standaard_werkmaatschappij_id uuid references public.bedrijfsgegevens(id) on delete set null,
  standaard_bouw7_categorie_id  integer,
  standaard_categorie           text,
  notificatie_medewerkers       uuid[] not null default '{}',
  dagbudget_cent                integer not null default 500,
  -- Gecachete Graph folder-id van de submap "Verwerkt door EVA"; leeg = opnieuw opzoeken.
  map_verwerkt_id               text,
  map_verwerkt_naam             text not null default 'Verwerkt door EVA',
  laatste_ophaal_op             timestamptz,
  laatste_ophaal_gelukt_op      timestamptz,
  laatste_fout                  text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- ── 2. Berichten ────────────────────────────────────────────────────────────
create table if not exists public.mailintake_berichten (
  id                      uuid primary key default gen_random_uuid(),
  postbus_id              uuid not null references public.mailintake_postbussen(id) on delete cascade,
  -- Mag verouderen: een move in Outlook geeft een nieuw id. Wordt bijgewerkt waar we het weten.
  graph_message_id        text,
  internet_message_id     text not null,
  conversation_id         text,
  onderwerp               text,
  van_naam                text,
  van_adres               text,
  aan                     text[] not null default '{}',
  cc                      text[] not null default '{}',
  ontvangen_op            timestamptz not null,
  body_tekst              text,
  body_preview            text,
  is_automatisch_antwoord boolean not null default false,
  is_antwoord             boolean not null default false,
  heeft_bijlagen          boolean not null default false,

  soort                   text,
  soort_vertrouwen        numeric(3,2),
  samenvatting            text,

  status                  text not null default 'nieuw'
                            check (status in ('nieuw','bezig','wacht_op_mens','verwerkt','genegeerd','geen_aanvraag','mislukt')),
  besluit                 text check (besluit in (
                            'automatisch_aangemaakt','handmatig_aangemaakt','gekoppeld_bestaand',
                            'meerwerk','offerte_gewonnen','genegeerd','geen_aanvraag')),

  dossier_id              uuid references public.dossiers(id) on delete set null,
  relatie_id              uuid references public.relaties(id) on delete set null,
  contactpersoon_id       uuid references public.contactpersonen(id) on delete set null,
  herkend_via             text check (herkend_via in ('alias','email_contactpersoon','email_domein','relatie_naam','handmatig')),
  herkenning_score        numeric(3,2),
  duplicaat_topscore      numeric(3,2),

  pogingen                integer not null default 0,
  laatste_fout            text,

  -- Nabehandeling in Outlook (categorie + verplaatsen). 'nvt' zolang het bericht
  -- geen eindtoestand heeft. Een mislukte move draait NOOIT het dossier terug.
  outlook_nabehandeling   text not null default 'nvt'
                            check (outlook_nabehandeling in ('nvt','open','gedaan','mislukt')),
  outlook_nabehandeling_op timestamptz,
  outlook_pogingen        integer not null default 0,
  outlook_fout            text,

  toegewezen_medewerker_id uuid references public.medewerkers(id) on delete set null,
  behandeld_door          uuid references public.medewerkers(id) on delete set null,
  behandeld_op            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Dit is de grendel tegen dubbel verwerken bij overlappende polls en retries.
create unique index if not exists mailintake_berichten_uniek
  on public.mailintake_berichten (postbus_id, internet_message_id);
create index if not exists mailintake_berichten_status_idx
  on public.mailintake_berichten (status, ontvangen_op desc);
create index if not exists mailintake_berichten_conversatie_idx
  on public.mailintake_berichten (conversation_id) where conversation_id is not null;
create index if not exists mailintake_berichten_dossier_idx
  on public.mailintake_berichten (dossier_id) where dossier_id is not null;
create index if not exists mailintake_berichten_postbus_status_idx
  on public.mailintake_berichten (postbus_id, status);
create index if not exists mailintake_berichten_nabehandeling_idx
  on public.mailintake_berichten (outlook_nabehandeling)
  where outlook_nabehandeling in ('open','mislukt');

-- ── 3. Bijlagen ─────────────────────────────────────────────────────────────
create table if not exists public.mailintake_bijlagen (
  id                  uuid primary key default gen_random_uuid(),
  bericht_id          uuid not null references public.mailintake_berichten(id) on delete cascade,
  graph_attachment_id text,
  bestandsnaam        text not null,
  content_type        text,
  grootte_bytes       integer,
  is_inline           boolean not null default false,
  -- Hash over de bytes: een identieke bijlage die al aan een dossier hangt is een sterk
  -- duplicaatsignaal (zie lib/mailintake/duplicaten.ts).
  sha256              text,
  opslag_pad          text,
  te_groot            boolean not null default false,
  rol                 text check (rol in ('opdrachtbon','bestek','tekening','foto','offerte','overig')),
  aan_ai_gegeven      boolean not null default false,
  naar_sharepoint_op  timestamptz,
  sharepoint_item_id  text,
  created_at          timestamptz not null default now()
);
-- Niet partieel: Postgres kan een partiele unieke index niet gebruiken voor
-- `on conflict (...)` zonder dezelfde WHERE in de statement, en PostgREST stuurt die
-- niet mee. graph_attachment_id is altijd gevuld (haalBijlageMeta filtert de rest weg).
create unique index if not exists mailintake_bijlagen_uniek
  on public.mailintake_bijlagen (bericht_id, graph_attachment_id);
create index if not exists mailintake_bijlagen_sha_idx
  on public.mailintake_bijlagen (sha256) where sha256 is not null;
create index if not exists mailintake_bijlagen_bericht_idx
  on public.mailintake_bijlagen (bericht_id);

-- ── 4. AI-extracties ────────────────────────────────────────────────────────
create table if not exists public.mailintake_extracties (
  id                uuid primary key default gen_random_uuid(),
  bericht_id        uuid not null references public.mailintake_berichten(id) on delete cascade,
  versie            integer not null default 1,
  model             text not null,
  prompt_versie     text not null,
  soort             text,
  velden            jsonb not null default '{}'::jsonb,
  vertrouwen        jsonb not null default '{}'::jsonb,
  vertrouwen_totaal numeric(3,2),
  toelichting       text,
  invoer_tokens     integer,
  uitvoer_tokens    integer,
  kosten_cent       integer,
  status            text not null default 'gereed' check (status in ('gereed','mislukt')),
  fout              text,
  ruwe_uitvoer      text,
  created_at        timestamptz not null default now()
);
create unique index if not exists mailintake_extracties_uniek
  on public.mailintake_extracties (bericht_id, versie);

-- ── 5. Duplicaat-kandidaten ─────────────────────────────────────────────────
create table if not exists public.mailintake_duplicaat_kandidaten (
  id         uuid primary key default gen_random_uuid(),
  bericht_id uuid not null references public.mailintake_berichten(id) on delete cascade,
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  score      numeric(3,2) not null,
  redenen    text[] not null default '{}',
  soort      text not null default 'duplicaat'
               check (soort in ('duplicaat','offerte_match','meerwerk_kandidaat')),
  gekozen    boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists mailintake_dup_uniek
  on public.mailintake_duplicaat_kandidaten (bericht_id, dossier_id);
create index if not exists mailintake_dup_score_idx
  on public.mailintake_duplicaat_kandidaten (bericht_id, score desc);

-- ── 6. Besluitenlog (append-only) ───────────────────────────────────────────
create table if not exists public.mailintake_besluiten (
  id            uuid primary key default gen_random_uuid(),
  bericht_id    uuid not null references public.mailintake_berichten(id) on delete cascade,
  moment        timestamptz not null default now(),
  actor         text not null check (actor in ('systeem','medewerker')),
  medewerker_id uuid references public.medewerkers(id) on delete set null,
  actie         text not null,
  details       jsonb not null default '{}'::jsonb
);
create index if not exists mailintake_besluiten_idx
  on public.mailintake_besluiten (bericht_id, moment);

-- ── 7. Aliassen — het leergeheugen ──────────────────────────────────────────
-- Elke handmatige klantkeuze in fase 1 schrijft hier een regel. Daardoor kan fase 2
-- automatisch aanmaken zonder dat iemand vooraf iets hoeft in te richten.
create table if not exists public.mailintake_aliassen (
  id                 uuid primary key default gen_random_uuid(),
  patroon            text not null,
  soort              text not null check (soort in ('koppel','negeer')),
  relatie_id         uuid references public.relaties(id) on delete cascade,
  contactpersoon_id  uuid references public.contactpersonen(id) on delete set null,
  aangemaakt_door    uuid references public.medewerkers(id) on delete set null,
  laatst_gebruikt_op timestamptz,
  created_at         timestamptz not null default now()
);
-- Op de kolom zelf, niet op lower(patroon): PostgREST kan alleen upserten tegen een
-- index op de kolom. De code schrijft het patroon altijd in kleine letters weg.
create unique index if not exists mailintake_aliassen_uniek
  on public.mailintake_aliassen (patroon);

-- ── 8. Herkomst op het dossier ──────────────────────────────────────────────
-- Nodig voor de nacontroles: welke dossiers komen uit mail, en hoeveel daarvan
-- zijn achteraf vervallen of afgewezen?
alter table public.dossiers
  add column if not exists mailintake_bericht_id uuid
    references public.mailintake_berichten(id) on delete set null;
create index if not exists dossiers_mailintake_idx
  on public.dossiers (mailintake_bericht_id) where mailintake_bericht_id is not null;

-- ── 9. Zoekindexen voor de duplicaatdetectie ────────────────────────────────
create index if not exists dossiers_titel_trgm
  on public.dossiers using gin (titel gin_trgm_ops);
create index if not exists dossiers_werkadres_idx
  on public.dossiers (werkadres_postcode, werkadres_huisnummer)
  where werkadres_postcode is not null;
create index if not exists dossiers_referentie_idx
  on public.dossiers (referentie) where referentie is not null;

-- ── 10. RLS — dicht ─────────────────────────────────────────────────────────
-- De crons en server actions draaien op de service-role client (die deze policies
-- bypasst) achter vereisRecht('mailintake', ...). Deze policies staan er zodat een
-- klantportaal-sessie — wel authenticated, geen platformgebruiker — er niet bij kan.
do $rls$
declare
  t text;
  tabellen text[] := array[
    'mailintake_postbussen','mailintake_berichten','mailintake_bijlagen',
    'mailintake_extracties','mailintake_duplicaat_kandidaten',
    'mailintake_besluiten','mailintake_aliassen'
  ];
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

-- ── 11. Bijlagenbucket ──────────────────────────────────────────────────────
-- Privé: dit is correspondentie van opdrachtgevers. Geen mime-whitelist, want er
-- komt van alles binnen (dwg, xlsx, zip). De 25 MB-grens is dezelfde als waarop
-- lib/o365/inbox.ts een bijlage nog downloadt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mail-intake', 'mail-intake', false, 26214400, null)
on conflict (id) do nothing;

do $buckets$
begin
  if not exists (select 1 from pg_policies where policyname = 'Mailintake bijlagen lezen' and tablename = 'objects') then
    create policy "Mailintake bijlagen lezen"
      on storage.objects for select to authenticated
      using (bucket_id = 'mail-intake' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Mailintake bijlagen uploaden' and tablename = 'objects') then
    create policy "Mailintake bijlagen uploaden"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'mail-intake' and is_platform_gebruiker());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Mailintake bijlagen verwijderen' and tablename = 'objects') then
    create policy "Mailintake bijlagen verwijderen"
      on storage.objects for delete to authenticated
      using (bucket_id = 'mail-intake' and is_platform_gebruiker());
  end if;
end $buckets$;

-- ── 12. Noodrem voor de Outlook-nabehandeling ───────────────────────────────
-- 'aan' = categoriseren + verplaatsen, 'alleen_categorie' = niets verplaatsen, 'uit' = niets.
-- Start op 'alleen_categorie': verplaatsen is de enige stap die zichtbaar iets verandert
-- in de mailbox van collega's, dus dat gaat pas aan als de triage betrouwbaar blijkt.
update public.bedrijfsinstellingen
set overige = coalesce(overige, '{}'::jsonb)
  || jsonb_build_object('mailintake_nabehandeling', 'alleen_categorie')
where id = 1
  and not (coalesce(overige, '{}'::jsonb) ? 'mailintake_nabehandeling');

-- ── 13. De drie postbussen (inactief tot ze zijn ingericht) ─────────────────
insert into public.mailintake_postbussen (sleutel, naam, adres, soort, actief)
values
  ('offerteaanvragen', 'Offerteaanvragen', 'offerte@evertsgroep.nl',     'offerteaanvraag', false),
  ('opdrachten',       'Opdrachten',       'opdracht@evertsgroep.nl',    'opdracht',        false),
  ('servicedesk',      'Servicedesk',      'servicedesk@evertsgroep.nl', 'servicedesk',     false)
on conflict (sleutel) do nothing;
