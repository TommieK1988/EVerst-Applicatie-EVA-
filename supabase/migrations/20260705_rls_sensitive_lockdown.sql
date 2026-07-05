-- RLS-aanscherping: gevoelige, uitsluitend server-side gebruikte tabellen afschermen.
--
-- Achtergrond: de basislijn-policy `app_authenticated_all` (USING(true)) gaf elke
-- ingelogde gebruiker via de publieke anon-key + zijn JWT (rol `authenticated`)
-- volledige lees/schrijf op deze tabellen rechtstreeks via de Supabase REST-API,
-- los van wat de app-UI toont. Deze tabellen bevatten bankrekeningen, tarieven,
-- lonen, debiteuren- en marge-informatie en worden in de app UITSLUITEND server-side
-- benaderd (server components + server actions met de service-role client).
--
-- Door de policy te droppen blijft RLS aan zonder policy voor `authenticated`/`anon`,
-- dus REST-toegang met de anon-key levert 0 rijen / wordt geweigerd. De service-role
-- (server) heeft BYPASSRLS en blijft ongehinderd werken → de app breekt niet.
--
-- Terugdraaien (indien nodig):
--   CREATE POLICY app_authenticated_all ON public.<tabel>
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);

do $$
declare
  t text;
  gevoelige_tabellen text[] := array[
    'relatie_bankgegevens',
    'relatie_uurtarieven',
    'relatie_inkoop_prijsafspraken',
    'relatie_inkoop_kortingsafspraken',
    'relatie_verkoop_prijsafspraken',
    'relatie_facturatie',
    'debiteuren',
    'debiteur_logboek',
    'debiteur_redencodes',
    'cao_loonschalen',
    'cao_documenten',
    'uren_regels',
    'regie_factuurregels',
    'inkoop_correcties',
    'meerwerk_regels'
  ];
begin
  foreach t in array gevoelige_tabellen loop
    execute format('drop policy if exists app_authenticated_all on public.%I', t);
    -- RLS expliciet aan laten staan (was al zo, maar borgen).
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
