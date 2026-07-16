-- Changelog-item voor de documenten-module (zie CLAUDE.md — "Wat is nieuw").
-- Eén item voor de hele functie; de losse onderdelen (sjabloonbeheer, mobiel
-- nummer op de medewerkerkaart) zijn geen zelfstandige items.

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-07-16','nieuw','Dossiers','Documenten opstellen vanuit het dossier',
    'Op het tabblad Bestanden staat nu de knop "Document opstellen": kies een sjabloon — bijvoorbeeld een bewonersbrief, garantiecertificaat of tussentijdse informatiebrief — en de gegevens van het dossier worden automatisch ingevuld, tot en met de naam en het telefoonnummer van de uitvoerder die langskomt. Je vult alleen aan wat niet in het dossier staat, zoals de omschrijving van de werkzaamheden of een garantietermijn, ziet meteen een voorbeeld, en kunt het document downloaden als PDF of Word of direct mailen vanaf je eigen Outlook. Wat je opstelt wordt bewaard in de dossiermap op SharePoint en blijft zichtbaar in de lijst, zodat je later kunt zien wat er wanneer naar wie is gestuurd — of er met één klik een nieuwe versie van maken.');
