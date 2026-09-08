-- Het item van vandaag over de factuurregels aanvullen in plaats van een tweede item over
-- hetzelfde scherm toe te voegen: losse regels horen bij dezelfde functie.
update public.changelog
   set omschrijving = 'Klik je bij een stelpost of regiepost op Aanpassen, dan zie je links alle geboekte uren en kosten en rechts de regels zoals ze op de factuur komen. Je past per regel het uurtarief, de opslag of het bedrag aan, zet posten uit voor een volgende keer, en voegt boekingen samen tot een regel. Ook het btw-tarief kies je per regel. En je kunt zelf regels toevoegen die nergens geboekt staan, zoals voorrij- of opstartkosten.'
 where titel = 'Zelf bepalen hoe regiewerk op de factuur komt'
   and datum = '2026-09-07';
