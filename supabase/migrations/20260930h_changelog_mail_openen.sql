-- Changelog: .eml-bestanden in de dossiermap openen weer.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-30','opgelost','Dossiers','Mailberichten in de dossiermap openen weer',
   'De aanvraagmail wordt sinds kort als bestand in de dossiermap gezet, maar aanklikken deed '
   || 'niets: SharePoint kan een mailbestand niet in beeld brengen. Zulke bestanden worden nu '
   || 'gedownload en openen daarna gewoon in Outlook. Andere bestanden openen nog steeds in '
   || 'SharePoint zelf.');
