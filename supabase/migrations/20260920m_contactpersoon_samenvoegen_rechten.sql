-- Nagekomen bij 20260920l: `revoke ... from public` haalt de Supabase-default privileges niet
-- weg. `anon` en `authenticated` krijgen execute op élke nieuwe functie, dus de samenvoeg-RPC
-- bleef rechtstreeks aanroepbaar. RLS hield hem tegen (de tabellen hebben geen schrijfpolicy),
-- maar dat is het tweede slot; dit is het eerste.
--
-- Beide functies horen alleen bereikbaar te zijn via de server-actions in
-- lib/relaties/ontdubbelen.ts, die met de service-role client draaien en zelf op het recht
-- `relaties` gaten.
revoke all on function public.contactpersoon_samenvoegen(uuid, uuid, uuid) from anon, authenticated;
revoke all on function public.contactpersoon_samenvoegen_ongedaan(uuid) from anon, authenticated;

-- Vaste search_path: beide functies bouwen hun UPDATE's met `format(%I)` op een tabelnaam.
-- Met een meebewegend zoekpad zou een tabel in een ander schema die naam kunnen kapen.
alter function public.contactpersoon_samenvoegen(uuid, uuid, uuid) set search_path = public, pg_temp;
alter function public.contactpersoon_samenvoegen_ongedaan(uuid) set search_path = public, pg_temp;
