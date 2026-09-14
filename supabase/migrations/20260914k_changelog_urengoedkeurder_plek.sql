-- Het item van vanmorgen wees naar Instellingen; de instelling staat nu op het
-- medewerkerprofiel zelf. Bijwerken in plaats van een tweede item: voor de lezer is dit
-- één functie, en twee regels over hetzelfde onderwerp leest als twee wijzigingen.
update public.changelog
   set omschrijving = 'Voor medewerkers buiten Uitvoering kun je nu één vaste goedkeurder aanwijzen. Die keurt alle uren van die medewerker, ongeacht op welk project ze staan — handig voor bijvoorbeeld calculators, die anders bij tien verschillende projectleiders terechtkomen. Je stelt het in op het medewerkerprofiel, onder Organisatie. Laat je het leeg, dan blijft de teamleider of projectleider van het dossier beoordelen.'
 where datum = '2026-09-14'
   and titel = 'Vaste goedkeurder voor uren van kantoor';
