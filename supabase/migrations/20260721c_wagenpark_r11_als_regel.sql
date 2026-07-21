-- =====================================================================
-- R11 weer als volwaardige regel: hij levert nu wél bevindingen op
-- =====================================================================
-- Eerder was R11 alleen een config-rij (straal + marges) en verscheen hij
-- verwarrend genoeg tussen de compliance-regels zonder ooit iets op te leveren.
-- Nu schrijft de werktijd-analyse haar te-laat/te-vroeg-signalen weg als
-- R11-bevindingen, zodat ze bij Wagenpark → Bevindingen verschijnen.
--
-- De bevindingen komen NIET uit de compliance-engine: die draait synchrone,
-- pure regels over een vaste context, terwijl de werktijd-analyse asynchrone
-- data nodig heeft (planning, roosters, afwezigheid, geocoding). Ze worden
-- geschreven door de dagelijkse en maandelijkse job (zie
-- lib/wagenpark/werktijd-bevindingen.ts). De compliance-run laat R11-rijen
-- expliciet met rust bij zijn opruimactie.
-- =====================================================================

update public.handboek_regels
   set titel = 'Te laat op / te vroeg van de werkplek',
       beschrijving =
         'Vergelijkt per bestuurder de aankomst op en het vertrek van de werkplek met de '
         || 'roostertijd (dagstart/dageind). De werkplek is de ingeplande projectlocatie van die '
         || 'dag, met het bedrijfsadres als terugval; een rit telt als "op locatie" binnen de '
         || 'ingestelde straal of bij dezelfde straat en plaats. Verlof onderdrukt het signaal. '
         || 'Bevindingen worden bijgewerkt door de dagelijkse en maandelijkse werktijd-analyse '
         || '(Wagenpark → Werktijden). Config: straal_meter, thuis_straal_meter, '
         || 'marge_aankomst_min, marge_vertrek_min.',
       actief = true,
       gewijzigd_op = now()
 where code = 'R11';
