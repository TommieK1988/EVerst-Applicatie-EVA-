-- Twee opgeloste fouten die gebruikers merkten: minderwerk was onzichtbaar in het
-- rekenblad en de werkbegroting, en de gekozen betalingscondities/algemene voorwaarden
-- werden niet bewaard bij de calculatie.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-06','opgelost','Calculatie','Negatieve bedragen worden weer getoond',
   'Een regel met een negatief bedrag, bijvoorbeeld minderwerk, bleef leeg in de kolommen voor uren, materiaal, onderaanneming en verkoopprijs. Ook telde een zojuist ingetypte negatieve prijs niet mee in de regel, en in de werkbegroting verdween hij zodra je verder klikte. Negatieve bedragen staan nu overal gewoon in beeld: in de regels, in de groepstotalen, in het eindtotaal en in de Excel-export.'),
  ('2026-08-06','opgelost','Calculatie','Betalingscondities en voorwaarden blijven nu staan',
   'De betalingscondities en algemene voorwaarden die je bij een calculatie koos, werden alleen op je eigen computer onthouden. Een collega zag daardoor een leeg veld, en bij het aanmaken van de offerte viel de keuze weg waardoor de offerte zonder betalingsschema werd opgesteld. De keuze wordt nu direct vastgelegd en is voor iedereen zichtbaar. Let op: keuzes van vóór deze verbetering zijn niet bewaard gebleven, die moet je eenmalig opnieuw instellen.');
