-- De module Commercieel (/m/commercieel) hangt aan het recht `relaties`, en het blok met
-- openstaande facturen daarin aan `financieel`. Sinds 20260920 (rechten per apparaat) zijn
-- desktop en mobiel losse sets; beide rechten stonden alleen in het desktopkanaal, waardoor
-- de tegel voor iedereen onzichtbaar bleef — ook voor een beheerder, want `alsPlatteSet`
-- geeft de beheerdersvlag niet door aan de platte set die de schermen gebruiken.
--
-- In de catalogus staan beide modules nu op `kanalen: ['desktop', 'mobiel']`, zodat ze in de
-- mobiele matrix te vinden zijn. Deze migratie vult het mobiele kanaal met exact het niveau
-- dat de afdeling op desktop al had: niemand krijgt een recht dat hij nog niet had, het staat
-- alleen ook op het andere kanaal. Afdelingen zonder dat recht op desktop blijven ongemoeid.
--
-- Persoonlijke afwijkingen (`medewerkers.rechten`) blijven bewust buiten schot: dat zijn
-- bedoelde uitzonderingen, en die klakkeloos spiegelen kan iets openzetten dat iemand juist
-- had dichtgezet. Wie een uitzondering nodig heeft, stelt die nu in via Instellingen >
-- Gebruikers, want de module is daar voortaan op mobiel zichtbaar.
update public.medewerker_afdelingen
   set rechten = jsonb_set(
         rechten,
         '{mobiel,modules}',
         coalesce(rechten->'mobiel'->'modules', '{}'::jsonb)
           -- `? 'sleutel'` test alleen of de sleutel bestaat, en een afdeling kan hem met
           -- waarde null hebben staan. Daarom op de waarde toetsen: een null meekopieren
           -- zet geen recht open, maar laat wel een lege sleutel achter die in de matrix
           -- leest als "bewust uitgezet" in plaats van "niet ingesteld".
           || case when jsonb_typeof(rechten->'desktop'->'modules'->'relaties') = 'string'
                   then jsonb_build_object('relaties', rechten->'desktop'->'modules'->'relaties')
                   else '{}'::jsonb end
           || case when jsonb_typeof(rechten->'desktop'->'modules'->'financieel') = 'string'
                   then jsonb_build_object('financieel', rechten->'desktop'->'modules'->'financieel')
                   else '{}'::jsonb end,
         true)
 where actief
   and rechten is not null
   and (jsonb_typeof(rechten->'desktop'->'modules'->'relaties') = 'string'
     or jsonb_typeof(rechten->'desktop'->'modules'->'financieel') = 'string');

-- Opruiming voor omgevingen waar een eerdere versie van deze migratie al draaide: die
-- kopieerde ook null-waarden mee. Een lege sleutel geeft geen toegang, maar leest in de
-- matrix als "bewust uitgezet" in plaats van "niet ingesteld". Op een verse omgeving doet
-- deze stap niets, want de update hierboven zet geen nulls meer.
--
-- Alleen de twee sleutels die deze migratie kan zetten. Lege sleutels elders blijven staan:
-- de desktopset van Projectbureau heeft er meerdere, en die zijn hier niet door ontstaan.
update public.medewerker_afdelingen
   set rechten = jsonb_set(
         rechten, '{mobiel,modules}',
         (rechten->'mobiel'->'modules')
           - (case when jsonb_typeof(rechten->'mobiel'->'modules'->'relaties')   = 'null' then 'relaties'   else '' end)
           - (case when jsonb_typeof(rechten->'mobiel'->'modules'->'financieel') = 'null' then 'financieel' else '' end),
         true)
 where actief and rechten is not null
   and (jsonb_typeof(rechten->'mobiel'->'modules'->'relaties')   = 'null'
     or jsonb_typeof(rechten->'mobiel'->'modules'->'financieel') = 'null');
