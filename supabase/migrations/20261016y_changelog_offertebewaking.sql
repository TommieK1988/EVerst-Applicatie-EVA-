-- Wat is nieuw: vernieuwde offertebewaking (live op 16-10-2026). Pas toepassen na de merge naar main.
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-16','verbeterd','Offertes','Offertes: Te doen laat zien wat je vandaag moet doen',
   'Onder Offertes begin je nu bij Te doen: per urgentie wat verlopen is, wat vandaag moet en wat nog niemand heeft opgepakt. Klik een offerte aan en de kaart opent ernaast, met bovenaan of je mag bellen, de contactpersoon, en de andere open offertes van dezelfde beheerder. Na het vastleggen van de uitkomst opent de volgende vanzelf. Je zoekt op klant of nummer, filtert op bedrag, en ziet per offerte waarom hij stilstaat en wanneer de klant beslist.',
   'kantoor'),
  ('2026-10-16','verbeterd','Offertes','Kleine offertes buiten de belronde, mega-offertes extra bewaakt',
   'Offertes onder € 3.000 staan standaard niet in je belronde; per offerte zet je dat op Altijd of Nooit. Voor offertes vanaf € 125.000 is de eigenaar een projectleider of de directie, en komen ze uiterlijk na twee weken terug als hercontrole. De grenzen stel je in onder Instellingen → Offertes → Offertebewaking.',
   'kantoor'),
  ('2026-10-16','opgelost','Offertes','Verloren offertes ook in Bouw7 op verloren',
   'Zet je een offerte in EVA op verloren of vervallen, dan krijgt de offerte in Bouw7 nu dezelfde status. Daardoor komt het project in Bouw7 ook op Afgewezen als er geen lopende offerte meer is.',
   'kantoor');
