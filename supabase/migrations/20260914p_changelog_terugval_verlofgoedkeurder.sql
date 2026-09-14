-- Bijwerken van het item van vandaag: "leeg" betekent niet meer "via het dossier", maar de
-- vaste goedkeurder uit Instellingen > Uren.
update public.changelog
   set omschrijving = 'Gewerkte uren worden altijd beoordeeld door de teamleider en daarna de projectleider van het dossier — ook die van kantoor, want het is hun project. Verlof, ziekte, vakantie en tijd-voor-tijd gaan voortaan naar één vaste goedkeurder. Die stel je per medewerker in op zijn profiel onder Organisatie; kies je daar niets, dan gaat het naar de goedkeurder die op Instellingen, Uren staat. Op het urenoverzicht zie je in de nieuwe kolom "Wacht op" per regel wie er aan zet is.'
 where datum = '2026-09-14'
   and titel = 'Wie keurt welke uren goed';
