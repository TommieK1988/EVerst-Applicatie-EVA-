insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-03','nieuw','Dossiers','Voorlopige planning op het dossier',
   'Je kunt nu een voorlopige start- en einddatum vastleggen: de periode die je met de opdrachtgever afspreekt voordat het werk echt is ingepland. De regel staat in het nieuwe Datums-blok en is met een sjabloonvariabele in de opdrachtbevestiging op te nemen.'),

  ('2026-09-03','verbeterd','Dossiers','Datums bij elkaar, en blokken die niet meer verspringen',
   'De datums van een dossier staan niet langer onderin Projectinformatie maar in een eigen blok. Verder heeft elk blok op de Informatie-tab dezelfde hoogte, zodat je informatie altijd op dezelfde plek staat. Past er meer in een blok dan er ruimte is, dan klap je het open met "Meer tonen".'),

  ('2026-09-03','opgelost','Dossiers','Opdrachtdatum bleef vaak leeg',
   'De opdrachtdatum werd alleen ingevuld bij bepaalde statuswissels, waardoor hij bij veel opdrachten leeg bleef. Hij wordt nu ook gevuld zodra een dossier op Nieuwe opdracht of Werkvoorbereiding komt, en bij dossiers die meteen als opdracht binnenkomen. Bij dossiers die al liepen blijft de datum leeg: die is achteraf niet betrouwbaar vast te stellen.');
