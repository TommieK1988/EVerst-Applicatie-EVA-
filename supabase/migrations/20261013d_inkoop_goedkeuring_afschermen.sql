-- Goedkeurroute inkoopfacturen afschermen (okt 2026).
--
-- Wie welke factuur goedkeurt is gevoelig (Tom). De route-tabellen kregen in 20261013b/c de
-- standaardpolicy `platform_gebruikers_all`, waarmee iedere ingelogde gebruiker ze via de
-- browser-client kon lezen én wijzigen. EVA leest en schrijft ze uitsluitend server-side met de
-- service-role (lib/inkoopfacturen/*), achter `vereisRecht('instellingen', 'beheren')` voor de
-- instellingen. Dus: RLS aan, géén policy → alleen de service-role komt erbij.

drop policy if exists platform_gebruikers_all on public.inkoop_goedkeur_regels;
drop policy if exists platform_gebruikers_all on public.inkoop_goedkeur_grootboek;
drop policy if exists platform_gebruikers_all on public.inkoop_goedkeur_stappen;

alter table public.inkoop_goedkeur_regels enable row level security;
alter table public.inkoop_goedkeur_grootboek enable row level security;
alter table public.inkoop_goedkeur_stappen enable row level security;

comment on table public.inkoop_goedkeur_regels is
  'Route voor EVA-goedkeuring van inkoopfacturen. Stap 1 = projectleider, anders grootboek- of terugval-goedkeurder; stap 2 boven drempel_excl. Gevoelig: geen RLS-policy, alleen service-role (scherm /instellingen/inkoop-goedkeuring, instellingen:beheren).';
