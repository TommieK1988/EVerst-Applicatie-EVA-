-- Tijd voor tijd reserveren op een werkdag.
--
-- Op de werktijdenlijst staat per dag het saldo tussen wat de auto op het werk
-- stond en wat er aan arbeidsuren geschreven is. Dat verschil is soms terecht --
-- iemand heeft langer doorgewerkt, of juist te veel geschreven -- en hoort dan
-- als tijd voor tijd verrekend te worden.
--
-- BEWUST GEEN URENBOEKING. Deze tabel raakt Bouw7 niet en verandert geen enkele
-- bestaande hour-log: het is een notitie in EVA dat het verschil van die dag
-- bekend is en als tijd voor tijd geldt. Zo blijft de urenadministratie intact
-- terwijl het saldo wel opschoont. Zodra het bij het uren boeken zelf als tijd
-- voor tijd wordt vastgelegd, is deze tabel de brug naar dat moment.
create table if not exists public.werktijd_tvt_reserveringen (
  id           uuid primary key default gen_random_uuid(),
  user_id_ulu  bigint not null,
  datum        date   not null,
  -- Ondertekend, precies zoals het dagsaldo: positief = langer aanwezig dan
  -- geschreven (bouwt op), negatief = meer geschreven dan aanwezig (neemt af).
  uren         numeric(6,2) not null,
  toelichting  text,
  gebruiker_id uuid references auth.users(id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  -- Eén reservering per bestuurderdag; opnieuw reserveren overschrijft.
  constraint werktijd_tvt_uniek unique (user_id_ulu, datum)
);

create index if not exists werktijd_tvt_datum_idx
  on public.werktijd_tvt_reserveringen (datum desc);

comment on table public.werktijd_tvt_reserveringen is
  'Dagsaldo uit de werktijdenlijst gereserveerd als tijd voor tijd. Alleen EVA; raakt geen Bouw7-urenboekingen.';

-- RLS: dicht voor iedereen behalve platformgebruikers, gelijk aan de rest van
-- de wagenpark-tabellen. De schermen lezen via de directe pooler (buiten RLS om)
-- achter het recht wagenpark_prive; deze policy is de bodem voor de anon-client.
alter table public.werktijd_tvt_reserveringen enable row level security;

drop policy if exists werktijd_tvt_platform on public.werktijd_tvt_reserveringen;
create policy werktijd_tvt_platform on public.werktijd_tvt_reserveringen
  for all to authenticated
  using (public.is_platform_gebruiker())
  with check (public.is_platform_gebruiker());
