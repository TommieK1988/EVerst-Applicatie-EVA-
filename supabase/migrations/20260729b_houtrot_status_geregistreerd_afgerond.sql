-- Twee eenvoudige statussen voor de houtrot-registratie in het veld:
-- Geregistreerd (default) en Afgerond (zodra er een na-foto is). De bestaande
-- enum-waarden blijven staan voor eventuele historie.
--
-- Toegepast op productie via de Supabase MCP op 2026-07-29.
alter type houtrotherstel.registratie_status add value if not exists 'geregistreerd';
alter type houtrotherstel.registratie_status add value if not exists 'afgerond';
