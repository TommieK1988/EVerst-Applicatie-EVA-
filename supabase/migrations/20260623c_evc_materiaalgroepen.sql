-- 20260623c_evc_materiaalgroepen.sql
--
-- Beheerbare eigen materiaalgroepen i.p.v. een vaste lijst in code (MATERIAAL_GROEPEN).
-- Gevuld met een brede standaardset, geschikt voor een breed bouwassortiment.
-- Idempotent.

create table if not exists public.evc_materiaalgroepen (
  id         uuid primary key default gen_random_uuid(),
  naam       text not null unique,
  volgorde   int not null default 0,
  actief     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.evc_materiaalgroepen enable row level security;
drop policy if exists app_authenticated_all on public.evc_materiaalgroepen;
create policy app_authenticated_all on public.evc_materiaalgroepen
  for all to authenticated using (true) with check (true);

insert into public.evc_materiaalgroepen (naam, volgorde) values
  ('Verf & lak', 10),
  ('Grondverf & primer', 20),
  ('Plamuur & kit', 30),
  ('Lijmen & bouwchemie', 40),
  ('Hout & plaatmateriaal', 50),
  ('Deuren & kozijnen', 60),
  ('Beton, mortel & cement', 70),
  ('Metsel- & gevelsteen', 80),
  ('Isolatie', 90),
  ('Dakbedekking', 100),
  ('Tegels & natuursteen', 110),
  ('Stukadoor & afbouw', 120),
  ('Gips- & wandsystemen', 130),
  ('Riolering & afvoer', 140),
  ('Bestrating, zand & grind', 150),
  ('Bevestiging & ijzerwaren', 160),
  ('Folie & verpakking', 170),
  ('Gereedschap & PBM', 180),
  ('Overig', 999)
on conflict (naam) do nothing;
