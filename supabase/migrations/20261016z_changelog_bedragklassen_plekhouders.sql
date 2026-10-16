-- Wat is nieuw: de bedragen in het item over de belronde volgen de instellingen.
-- {offerte_klein_tot} en {offerte_mega_vanaf} vult het scherm in met de actuele grenzen
-- (lib/changelog/plekhouders.ts), zodat de tekst klopt als iemand ze aanpast.
update public.changelog
set omschrijving = 'Offertes onder {offerte_klein_tot} staan standaard niet in je belronde; per offerte zet je dat op Altijd of Nooit. Voor offertes vanaf {offerte_mega_vanaf} is de eigenaar een projectleider of de directie, en komen ze uiterlijk na twee weken terug als hercontrole. De grenzen stel je in onder Instellingen → Offertes → Offertebewaking.'
where titel = 'Kleine offertes buiten de belronde, mega-offertes extra bewaakt'
  and datum = '2026-10-16';
