-- Werkafspraken: wat de binnendienst EVA meegeeft over het lezen van de post.
--
-- Tot nu toe stond elke regel in code. "Een mandaat betekent altijd regie", "een
-- adrestreffer is geen offerte" -- allemaal via een ontwikkelaar en een deploy. De
-- mensen die de post dagelijks lezen weten die dingen als eerste, en konden er niets
-- mee.
--
-- Deze afspraken sturen het LEZEN, niet de besluiten. De harde poorten blijven waar
-- ze zijn: de categorie komt uit een witte lijst, het adres langs PDOK, bedragen
-- langs een bereikcontrole, en de route en fase volgen code die getest is. Een
-- afspraak kan die niet openzetten -- dat is het verschil tussen een aanwijzing en
-- een achterdeur.
create table if not exists public.mailintake_werkafspraken (
  id uuid primary key default gen_random_uuid(),
  -- Null = voor alle postbussen. Een afspraak over hoe een bepaalde opdrachtgever
  -- zijn bonnen opstuurt hoort bij één bus; "een mandaat is regie" bij alle.
  postbus_id uuid references public.mailintake_postbussen(id) on delete cascade,
  tekst text not null check (length(btrim(tekst)) between 3 and 2000),
  -- Wat EVA ervan begreep, in zijn eigen woorden. Staat erbij zodat een afspraak die
  -- anders landt dan bedoeld meteen opvalt en niet pas bij de tiende mail.
  uitleg text,
  actief boolean not null default true,
  aangemaakt_door uuid references public.medewerkers(id),
  -- Archiveren, niet verwijderen: een afspraak verklaart hoe berichten uit die
  -- periode gelezen zijn. Zie DEVELOPMENT_STANDARDS.md 5.5.
  gearchiveerd_op timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mailintake_werkafspraken_actief_idx
  on public.mailintake_werkafspraken (postbus_id, actief)
  where gearchiveerd_op is null;

alter table public.mailintake_werkafspraken enable row level security;

drop policy if exists platform_gebruikers_all on public.mailintake_werkafspraken;
create policy platform_gebruikers_all on public.mailintake_werkafspraken
  for all to authenticated
  using ((select is_platform_gebruiker()))
  with check ((select is_platform_gebruiker()));

comment on table public.mailintake_werkafspraken is
  'Afspraken in gewone taal die het lezen van binnenkomende mail sturen. Nooit een vervanging van de deterministische poorten in extractie.ts.';

-- Een aanwijzing voor dit ene bericht: "de opdrachtgever is de VvE, niet de
-- beheerder", "het bonnummer staat in de onderwerpregel".
--
-- Staat op het bericht en niet alleen in het geheugen van het scherm, om twee
-- redenen. Hij moet een herlezing overleven -- dat is juist waar hij voor is -- en
-- hij verklaart achteraf waarom dit bericht anders gelezen is dan de regels zouden
-- doen vermoeden.
alter table public.mailintake_berichten
  add column if not exists aanwijzing text,
  add column if not exists aanwijzing_op timestamptz,
  add column if not exists aanwijzing_door uuid references public.medewerkers(id);

comment on column public.mailintake_berichten.aanwijzing is
  'Vrije aanwijzing van een medewerker voor het lezen van dit ene bericht. Gaat als eigen blok de prompt in, naast de algemene werkafspraken, en overleeft een herlezing.';
