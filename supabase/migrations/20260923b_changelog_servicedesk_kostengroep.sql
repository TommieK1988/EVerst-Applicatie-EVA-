-- Changelog: vaste kostengroep per afrekenwijze + bestelregels zonder werkbegroting.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-23','nieuw','Servicedesk','Elke bon heeft nu een eigen kostengroep',
   'Een bon op regie kreeg al de kostengroep Regiewerkzaamheden; aangenomen werk had er geen en alles belandde in Bouw7 ongecodeerd. Nu krijgt een aangenomen bon de groep Aangenomen werk. Op het tabblad Facturatie zie je welke groep het is en wat erop geboekt staat: bij regie factureer je daarvandaan, bij aangenomen werk lopen de kosten erop binnen en reken je af via de termijnstaat.'),

  ('2026-09-23','nieuw','Servicedesk','Opdracht uitzetten zonder de werkbegroting',
   'De knop "Onderaannemerscontract maken" opent nu een klein venster op de bon zelf: kies de onderaannemer of leverancier, typ de regels met hun bedragen, en loop door naar de opdracht en de mail. Je hoeft niet meer via de werkbegroting, die voor grote projecten is gemaakt. De regels komen automatisch op de kostengroep van de bon te staan.'),

  ('2026-09-23','verbeterd','Servicedesk','Overzichtelijker urenoverzicht op een bon',
   'De tabel "Uren per bewakingscode" is van de bon af. Een bon heeft één kostengroep, dus die tabel was altijd één regel lang en toonde vooral nullen. De lijst met geboekte uren per medewerker staat er gewoon nog.');
