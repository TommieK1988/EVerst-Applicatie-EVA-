-- Wat is nieuw: Bord, Lijst en tabblad Bewaking gelijkgetrokken met Te doen, en de opschoonronde
-- (live op 16-10-2026). Toepassen na de merge naar main.
insert into public.changelog (datum, categorie, module, titel, omschrijving, doelgroep) values
  ('2026-10-16','verbeterd','Offertes','Bord, Lijst en tabblad Bewaking zeggen hetzelfde als Te doen',
   'Op het Bord staat bij elke offerte de stand in woorden (bijvoorbeeld "Actie verlopen · 13 okt"), de volgende stap en de eigenaar. De Lijst toont standaard dezelfde fases als het bord, met status, volgende stap en eigenaar. Een klik op een offerte opent op beide de kaart uit Te doen, waar je meteen de uitkomst vastlegt. Het tabblad Bewaking in het dossier gebruikt nu diezelfde kaart.',
   'kantoor'),
  ('2026-10-16','nieuw','Offertes','Oude offertes in één keer opruimen',
   'Onder Opschonen in Te doen staan de open offertes die langer dan drie maanden geleden zijn verzonden. Vink aan wat niet meer loopt en laat het in één keer vervallen, met reden; Bouw7 wordt meteen bijgewerkt.',
   'kantoor');
