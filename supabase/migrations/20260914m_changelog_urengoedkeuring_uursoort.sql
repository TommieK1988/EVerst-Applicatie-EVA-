-- De regel is veranderd: niet meer "alle uren van deze medewerker", maar alleen zijn
-- niet-gewerkte uren. Bijwerken in plaats van een tweede item: voor de lezer is dit één
-- functie, en twee regels over hetzelfde onderwerp leest als twee wijzigingen.
update public.changelog
   set titel = 'Wie keurt welke uren goed',
       omschrijving = 'Gewerkte uren worden altijd beoordeeld door de teamleider en daarna de projectleider van het dossier — ook die van kantoor, want het is hun project. Verlof, ziekte, vakantie en tijd-voor-tijd gaan voortaan naar één vaste goedkeurder, die je per medewerker instelt op zijn profiel onder Organisatie. Op het urenoverzicht staat een nieuwe kolom "Wacht op": daar zie je per regel wie er aan zet is.'
 where datum = '2026-09-14'
   and titel = 'Vaste goedkeurder voor uren van kantoor';
