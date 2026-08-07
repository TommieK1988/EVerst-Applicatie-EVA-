-- Werkstand per gebruiker per overzichtscherm.
--
-- Aanleiding: alle tabelinstellingen (kolommen aan/uit, volgorde, breedte, sortering,
-- filters, zoekterm, paginagrootte) leefden uitsluitend in React-state. Wisselen tussen
-- kanban en lijst unmount de tabel, dus alles ging verloren. Hetzelfde bij F5 en bij
-- navigeren. `gebruiker_layouts` bood alleen een handmatig opgeslagen, benoemde layout —
-- en die werd bij terugkomst alleen toegepast als hij als standaard was gemarkeerd.
--
-- Deze tabel bewaart de *laatst gebruikte* stand: geen naam, geen beheer, één rij per
-- gebruiker per scherm. `gebruiker_layouts` blijft wat het is (benoemde weergaven die je
-- bewust opslaat en terugkiest).
--
-- `staat` is bewust één jsonb-blob: de vorm hoort bij de tabelcomponent en verandert mee
-- met de UI, niet met het datamodel. Er wordt nooit op gequeryd, alleen op de sleutel.

create table if not exists public.gebruiker_werkstand (
  user_id    uuid        not null,
  scherm     text        not null,
  staat      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, scherm)
);

comment on table public.gebruiker_werkstand is
  'Laatst gebruikte tabelinstellingen per gebruiker per overzichtscherm (kolommen, sortering, filters, zoekterm, paginagrootte).';
comment on column public.gebruiker_werkstand.staat is
  'Vrije jsonb-blob met versieveld; vorm wordt bepaald door TabelWerkstand in platform-types.ts.';

-- Zelfde basislijn als de rest van de app (zie 20260616c): anon buiten, authenticated erin,
-- service-role omzeilt RLS sowieso.
alter table public.gebruiker_werkstand enable row level security;
drop policy if exists app_authenticated_all on public.gebruiker_werkstand;
create policy app_authenticated_all on public.gebruiker_werkstand
  for all to authenticated using (true) with check (true);
