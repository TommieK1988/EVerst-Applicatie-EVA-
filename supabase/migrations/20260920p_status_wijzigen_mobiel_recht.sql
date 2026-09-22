-- Status wijzigen in de app: de functie `dossiers.status_wijzigen` (kanaal mobiel).
--
-- De functie heeft in de catalogus géén `inbegrepenVanaf`, dus hij staat voor
-- iedereen uit — óók voor wie op mobiel `dossiers: beheren` heeft. Precies de
-- bedoeling: wie in het veld een dossier opent hoort de stand te lezen, niet de
-- fase van het project te verzetten. Zo'n wijziging gaat door naar Bouw7 en kan
-- het dossier zelfs definitief afsluiten.
--
-- Directie krijgt hem hier expliciet aan. Dat is vandaag gedragsgelijk — Directie
-- heeft `instellingen: beheren` en een beheerder haalt elke functie vanzelf —
-- maar dan staat het vinkje in het rechtenscherm ook zichtbaar op "Aan" in plaats
-- van op "Standaard". Wie het later bij iemand anders wil aanzetten, doet dat op
-- Gebruikers → de persoon → tabblad Mobiel → Dossiers uitklappen.
update public.medewerker_afdelingen
   set rechten = jsonb_set(
         rechten,
         '{mobiel,functies,dossiers.status_wijzigen}',
         'true'::jsonb,
         true)
 where naam = 'Directie'
   and rechten ? 'mobiel';

-- De platte v1-spiegel blijft ongemoeid: functies bestaan daar niet.
