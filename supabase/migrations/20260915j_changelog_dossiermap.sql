-- Changelog-item: EVA maakt de SharePoint-dossiermap voortaan zelf aan.
-- Pas toegevoegd nadat de wijziging op main stond (zie CLAUDE.md).

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-15', 'nieuw', 'Dossiers', 'De dossiermap wordt automatisch aangemaakt',
   'Maak je een nieuwe aanvraag aan, dan zet EVA meteen de bijbehorende map in SharePoint klaar, met het dossiernummer en de projectnaam erin. Je hoeft die dus niet meer zelf aan te maken of op te zoeken. Wijzig je later de projectnaam, dan past EVA de mapnaam vanzelf aan.'),
  ('2026-09-15', 'nieuw', 'Dossiers', 'Vaste voorbeeldbestanden in elke dossiermap',
   'Onder Instellingen > Dossiermap kun je bestanden klaarzetten die automatisch in elke nieuwe dossiermap komen te staan, bijvoorbeeld een checklist of een formulier. Je kunt per bestand een submap kiezen, en aangeven dat het alleen geldt voor bepaalde soorten werk of voor een bepaalde werkmaatschappij.');
