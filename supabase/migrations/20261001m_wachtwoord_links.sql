-- Eigen activatie- en herstellinks voor app-gebruikers (wachtwoordaccounts).
--
-- Waarom niet de links van Supabase zelf: die verlopen na een uur, worden door
-- mail-scanners (Outlook Safe Links, iCloud-preview) al "aangeklikt" voordat de
-- medewerker dat doet, en de ingebouwde mailer van Supabase staat maar een paar
-- mails per uur toe. Op 1 oktober 2026 kwam daardoor geen van de twintig nieuwe
-- app-gebruikers binnen. Deze links leven zeven dagen (herstel: een dag), en
-- worden pas verbruikt als er echt een wachtwoord is gekozen.
--
-- Alleen de SHA-256-hash van het token staat hier; het token zelf staat
-- uitsluitend in de mail. RLS aan zonder policies: alleen de service-role komt
-- erbij.

create table if not exists public.wachtwoord_links (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  token_hash    text not null unique,
  doel          text not null check (doel in ('uitnodiging', 'herstel')),
  verloopt_op   timestamptz not null,
  gebruikt_op   timestamptz,
  aangemaakt_op timestamptz not null default now()
);

create index if not exists wachtwoord_links_auth_user_idx on public.wachtwoord_links (auth_user_id);

alter table public.wachtwoord_links enable row level security;
