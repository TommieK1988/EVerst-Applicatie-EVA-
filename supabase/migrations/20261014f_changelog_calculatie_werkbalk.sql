-- Wat is nieuw: calculatie fase 1, werkbalk en totaalbalk opgeruimd (live op 14-10-2026).
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-14','verbeterd','Calculatie','Calculatiescherm overzichtelijker',
   'De knoppen boven de calculatie zijn opnieuw ingedeeld: offerte maken zit onder de groene knop Offerte, importeren en exporteren onder Meer. De structuur opent op klik naast de regels en blijft open. De balk onderin leest nu als een som van kostprijs naar totaal, met de marge rechts. Een kolomlayout zet je uit met Standaardkolommen, en een nieuw uurtarief geldt nu ook voor regels waar nog geen uren op staan.',
   'kantoor');
