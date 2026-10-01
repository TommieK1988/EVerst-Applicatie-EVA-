-- Status wijzigen in de app ook voor Projectbureau.
--
-- `dossiers.status_wijzigen` (kanaal mobiel) stond alleen bij Directie aan (zie
-- 20260920p). Een projectbureau-medewerker die als uitvoerder op een bon staat
-- kon die bon op zijn telefoon dus niet van Nieuw naar Onderhanden zetten: de
-- statuskiezer was alleen een badge. Projectbureau stuurt de fase van zijn eigen
-- dossiers ook op de desktop, dus hoort hij dat in het veld ook te kunnen.
--
-- Directie gaat opnieuw mee: bij Directie stond `functies` inmiddels weer leeg
-- (vermoedelijk overschreven bij opslaan in het rechtenscherm). Gedragsgelijk —
-- Directie is beheerder — maar zo staat het vinkje weer zichtbaar op "Aan".
update public.medewerker_afdelingen
   set rechten = jsonb_set(
         rechten,
         '{mobiel,functies,dossiers.status_wijzigen}',
         'true'::jsonb,
         true)
 where naam in ('Projectbureau', 'Directie')
   and rechten ? 'mobiel';
