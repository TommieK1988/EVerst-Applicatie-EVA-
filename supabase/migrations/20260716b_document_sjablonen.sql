-- Documenten-module: sjablonen + registratie van gegenereerde documenten.
--
-- Sjablonen voor (standaard)documenten: bewonersbrief, garantiecertificaat,
-- tussentijdse informatiebrief. De Word-template-koppeling is exact gelijk aan
-- quote_layouts, zodat loadTemplateBuffer() (lib/documenten/render-docx.ts) beide
-- rijen zonder aanpassing kan lezen.
--
-- Bewust GEEN kleur-/marge-/lettertype-/papier-velden zoals quote_layouts die heeft:
-- dat zijn resten uit het HTML-tijdperk. In de Word-only pijplijn bepaalt het .docx
-- zelf de opmaak.

create table if not exists public.document_sjablonen (
  id                     uuid primary key default gen_random_uuid(),
  naam                   text not null,
  beschrijving           text,
  -- bewonersbrief | garantiecertificaat | informatiebrief | overig
  documentsoort          text not null default 'overig',

  -- Word-template — dezelfde vijf velden als quote_layouts.
  docx_template_url      text,
  docx_template_bron     text,          -- 'bucket' | 'sharepoint' | 'onedrive'
  docx_template_drive_id text,
  docx_template_item_id  text,
  docx_template_web_url  text,
  briefpapier_pdf_url    text,

  -- Invoervelden die bij het genereren gevraagd worden.
  velden                 jsonb not null default '[]'::jsonb,

  -- Standaard mailtekst; {tags} worden met dezelfde context gerenderd.
  mail_onderwerp         text,
  mail_body_html         text,

  -- Zichtbaarheid in het dossier. Leeg/null = geen filter.
  categorie_filter       text[],
  hoofdstatus_filter     text[],
  werkmaatschappij_id    uuid references public.bedrijfsgegevens(id) on delete set null,

  -- bv. '{documentsoort} {dossier.dossiernummer}' → bestandsnaam in SharePoint.
  bestandsnaam_sjabloon  text,

  actief                 boolean not null default true,
  volgorde               integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on column public.document_sjablonen.velden is
  'Invoervelden die bij het genereren worden gevraagd. Elk veld: sleutel (tag {invoer.<sleutel>}), '
  'label, type (tekst|meerregelig|datum|getal|keuze|checkbox), verplicht, standaard, opties[], hint.';

comment on column public.document_sjablonen.docx_template_bron is
  'bucket = docx_template_url wijst naar Supabase storage; sharepoint/onedrive = via Graph met drive_id+item_id.';

alter table public.document_sjablonen enable row level security;

drop policy if exists platform_gebruikers_all on public.document_sjablonen;
create policy platform_gebruikers_all on public.document_sjablonen
  for all to authenticated
  using (is_platform_gebruiker()) with check (is_platform_gebruiker());


-- Registratie van elk gegenereerd document. Het bestand zelf leeft alleen in
-- SharePoint; dit is puur een index (wie/wanneer/welke invoer/naar wie gemaild)
-- en maakt "opnieuw opstellen met dezelfde invoer" mogelijk.
create table if not exists public.dossier_documenten (
  id                   uuid primary key default gen_random_uuid(),
  dossier_id           uuid not null references public.dossiers(id) on delete cascade,
  sjabloon_id          uuid references public.document_sjablonen(id) on delete set null,
  documentsoort        text not null default 'overig',
  bestandsnaam         text not null,
  invoer               jsonb not null default '{}'::jsonb,

  sharepoint_drive_id  text,
  sharepoint_item_id   text,
  sharepoint_web_url   text,

  gegenereerd_door     uuid references public.medewerkers(id) on delete set null,
  gegenereerd_op       timestamptz not null default now(),
  gemaild_op           timestamptz,
  gemaild_naar         text[],
  created_at           timestamptz not null default now()
);

create index if not exists dossier_documenten_dossier_idx
  on public.dossier_documenten (dossier_id, gegenereerd_op desc);

alter table public.dossier_documenten enable row level security;

drop policy if exists platform_gebruikers_all on public.dossier_documenten;
create policy platform_gebruikers_all on public.dossier_documenten
  for all to authenticated
  using (is_platform_gebruiker()) with check (is_platform_gebruiker());
