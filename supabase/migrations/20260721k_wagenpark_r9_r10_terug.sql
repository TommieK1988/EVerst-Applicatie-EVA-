-- =====================================================================
-- R9 en R10 terug, nu op basis van ritketens. R11 vervalt.
-- =====================================================================
-- R9/R10 stonden uit omdat ze naar de kále eerste en laatste rit-tijd van de
-- dag keken: dat is het vertrek van huis en de aankomst thuis, niet de aankomst
-- op en het vertrek van het werk. R11 verving ze met een locatie-analyse rond de
-- ingeplande projectlocatie, maar die stelt zware eisen aan de data (gevulde
-- planning, concrete werkadressen, kloppende woonadressen, geocoding van
-- adressen zonder huisnummer) en gaf daardoor vaak "niet op locatie" in plaats
-- van een signaal.
--
-- De nieuwe R9/R10 werken op RITKETENS: opeenvolgende ritten met minder dan een
-- paar minuten ertussen zijn samen één verplaatsing. Het einde van de eerste
-- keten is de aankomst op het werk, het begin van de laatste keten het vertrek.
-- Elke stop die geen tussenstop is telt als werkplek — ook de groothandel of het
-- eigen depot. Daar komt geen coördinaat aan te pas, dus de regels zijn bestand
-- tegen een verouderd woonadres of een leeg dossier-werkadres.
-- =====================================================================

update public.handboek_regels
   set titel = 'Te laat aangekomen op het werk',
       beschrijving =
         'Vergelijkt de aankomst op het werk met de dagstart uit het werkrooster. Aankomst = het '
         || 'einde van de eerste zakelijke ritketen van de dag; ritten met minder dan '
         || 'keten_pauze_min minuten ertussen tellen als één rit, zodat een tankstop of een '
         || 'opgesplitste registratie niet voor een aankomst wordt aangezien. Elke stop die geen '
         || 'tussenstop is telt als werkplek, dus ook de groothandel of het depot. Verlof '
         || 'onderdrukt het signaal en de lopende dag wordt niet beoordeeld. Alle ritten van de '
         || 'bepalende keten krijgen een signaal; de rit die de aankomsttijd bepaalt draagt de '
         || 'ernst. Een afwijking tot en met overtreding_vanaf_min minuten is een waarschuwing, '
         || 'daarboven een overtreding. Config: marge_minuten, keten_pauze_min, '
         || 'overtreding_vanaf_min.',
       actief = true,
       drempel_config = jsonb_build_object(
         'marge_minuten', 0,
         'keten_pauze_min', 5,
         'overtreding_vanaf_min', 5
       ),
       gewijzigd_op = now()
 where code = 'R9';

update public.handboek_regels
   set titel = 'Te vroeg vertrokken van het werk',
       beschrijving =
         'Het spiegelbeeld van R9: vergelijkt het vertrek van het werk met het dageind uit het '
         || 'werkrooster. Vertrek = het begin van de laatste zakelijke ritketen van de dag, zodat '
         || 'een tussenstop bij het depot niet als vertrek geldt en een tankstop onderweg naar huis '
         || 'het moment niet verschuift. Een dag met maar één ritketen wordt overgeslagen: dan is '
         || 'alleen de heenreis bekend. Verlof onderdrukt het signaal en de lopende dag wordt niet '
         || 'beoordeeld. Een afwijking tot en met overtreding_vanaf_min minuten is een '
         || 'waarschuwing, daarboven een overtreding. Config: marge_minuten, keten_pauze_min, '
         || 'overtreding_vanaf_min.',
       actief = true,
       drempel_config = jsonb_build_object(
         'marge_minuten', 0,
         'keten_pauze_min', 5,
         'overtreding_vanaf_min', 5
       ),
       gewijzigd_op = now()
 where code = 'R10';

update public.handboek_regels
   set titel = 'Werktijd-analyse op locatie (vervallen)',
       beschrijving =
         'Vervallen per 21 juli 2026 — opgevolgd door R9 (te laat aangekomen) en R10 (te vroeg '
         || 'vertrokken), die dezelfde vraag beantwoorden zonder geocoding en zonder afhankelijkheid '
         || 'van een gevulde planning. Deze regel levert geen bevindingen meer.',
       actief = false,
       gewijzigd_op = now()
 where code = 'R11';

-- Automatisch gegenereerde R11-bevindingen opruimen: die gaan over dezelfde
-- dagen als de nieuwe R9/R10-signalen en zouden dubbel in het overzicht staan.
-- Handmatig toegekende signalen blijven staan — die zijn door een mens gemaakt
-- en vormen de naslag waaraan de nieuwe regels zijn geijkt.
delete from public.compliance_bevindingen
 where regel_code = 'R11'
   and bron = 'automatisch';
