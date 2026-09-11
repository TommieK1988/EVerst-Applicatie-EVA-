-- Het changelog-item van vanochtend beloofde een btw-instelling per opdrachtgever en
-- per dossier. Die is diezelfde dag weer ingetrokken (zie 20260911q); de tekst stond
-- al bij iedereen op het scherm, dus hier bijgesteld in plaats van een nieuw item.
--
-- Ook de keuze "met of zonder prijzen" is geen vinkje meer maar de sjabloonkeuze.
--
-- Toegepast op productie via de Supabase MCP op 2026-09-11.
update public.changelog set
  omschrijving =
    'Het totaaloverzicht telt de werkzaamheden van alle registraties bij elkaar op: per soort werk '
    || 'het totale aantal, de eenheidsprijs, het btw-percentage en het regeltotaal. Onderaan staat het '
    || 'bedrag per btw-tarief en het totaal inclusief btw. Het btw-percentage komt uit de eenheidsprijs '
    || 'in de Recepten-bibliotheek. Bij het opstellen kies je het sjabloon: met of zonder prijzen.'
where titel = 'Btw en werkzaamheden op de rapportage';
