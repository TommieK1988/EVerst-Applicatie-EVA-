-- =====================================================================
-- R11 duidelijker labelen: het is een INSTELLING, geen compliance-regel
-- =====================================================================
-- R11 stond met een regelcode en actief=true in handboek_regels en leek
-- daardoor een compliance-regel die bevindingen hoort op te leveren. Dat is
-- hij niet: R11 bestaat alleen om de straal en marges van de werktijd-analyse
-- bewerkbaar te maken via het bestaande instellingen-scherm. De analyse draait
-- via de eigen cronjobs (dagoverzicht/maandrapport) en de pagina
-- /wagenpark/werktijden — niet via de compliance-engine (ALLE_REGELS bevat
-- geen R11). Alleen de titel/omschrijving wijzigen; de config blijft intact.
-- =====================================================================

update public.handboek_regels
   set titel = 'Werktijd-analyse — instelling (levert geen bevindingen)',
       beschrijving =
         'INSTELLING, geen compliance-regel. Bepaalt de straal rond werk- en woonadres '
         || 'en de marges voor de werktijd-analyse (aanwezigheid op locatie). De uitkomst '
         || 'verschijnt op Wagenpark → Werktijden en in de dagelijkse/maandelijkse melding, '
         || 'niet bij Bevindingen. Sleutels: straal_meter, thuis_straal_meter, '
         || 'marge_aankomst_min, marge_vertrek_min.',
       gewijzigd_op = now()
 where code = 'R11';
