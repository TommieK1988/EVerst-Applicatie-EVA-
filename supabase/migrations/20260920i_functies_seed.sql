-- Seed bij het in gebruik nemen van de eerste functies (fase 6). Hoort bij de
-- codewijziging in dezelfde stap: seeden vóór of ná de uitrol laat een gat vallen.
--
-- Drie functies waren al een verkapte module (wagenpark_prive, alle_taken,
-- inkoopfacturen_alle) en zijn in 20260920g/h meegekomen; die staan dus al goed.
-- Hier gaan de twee functies aan die een écht gat dichten.

-- 1) formulieren.sjablonen_beheren
--
-- Sjablonen ontwerpen stond op `formulieren: lezen`: wie het inzendingenoverzicht
-- mocht openen, kon de formulieren herbouwen. De functie is `inbegrepenVanaf:
-- beheren`, dus Directie en Chris houden hem vanzelf. Gerben, Marjolein en Olga
-- staan op `schrijven` en zouden hem verliezen — die krijgen hem expliciet, zodat
-- niemand vandaag iets kwijtraakt. Het recht is nu wél zichtbaar en intrekbaar.
update public.medewerkers
   set rechten = jsonb_set(
         rechten,
         '{desktop,functies,formulieren.sjablonen_beheren}',
         'true'::jsonb,
         true)
 where email in ('gerben@everts.chat', 'marjolein@everts.chat', 'olga@everts.chat')
   and rechten ? 'desktop';

-- 2) medewerkers.persoonsgegevens en medewerkers.tarieven
--
-- BSN, woonadres, geboortedatum, uurtarieven en CAO-schaal zaten óók op
-- `medewerkers: lezen`. Dat is te ruim: een projectleider heeft de
-- medewerkerskaart nodig (telefoonnummer, functie, rooster), geen burgerservice-
-- nummer en geen salaris.
--
-- Hier gaat wél iets veranderen, en dat is de bedoeling. Directie en de
-- ondersteunende administratie houden de gegevens; de negen collega's van
-- Projectbureau niet meer. Ziet iemand daardoor iets niet dat hij wél nodig
-- heeft, dan is dat op het rechtenscherm met één vinkje terug te zetten —
-- Gebruikers → de persoon → Medewerkers uitklappen.
update public.medewerker_afdelingen
   set rechten = jsonb_set(
         jsonb_set(rechten, '{desktop,functies,medewerkers.persoonsgegevens}', 'true'::jsonb, true),
         '{desktop,functies,medewerkers.tarieven}', 'true'::jsonb, true)
 where naam = 'Directie'
   and rechten ? 'desktop';

update public.medewerkers
   set rechten = jsonb_set(
         jsonb_set(rechten, '{desktop,functies,medewerkers.persoonsgegevens}', 'true'::jsonb, true),
         '{desktop,functies,medewerkers.tarieven}', 'true'::jsonb, true)
 where email in ('marjolein@everts.chat', 'olga@everts.chat')
   and rechten ? 'desktop';

-- De platte spiegel hoeft niet bij: functies bestaan daar niet, en de drie
-- SQL-lezers kijken alleen naar modules.
