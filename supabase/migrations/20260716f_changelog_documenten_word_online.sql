-- De Word-knop downloadt niet meer maar opent het document in Word Online.
-- Zelfde dag, zelfde functie als 20260716e → tekst van het bestaande item
-- bijwerken i.p.v. een bijna-identiek tweede item (zie CLAUDE.md: bundelen).

update public.changelog
   set omschrijving = 'Op het tabblad Bestanden staat nu de knop "Document opstellen": kies een sjabloon — bijvoorbeeld een bewonersbrief, garantiecertificaat of tussentijdse informatiebrief — en de gegevens van het dossier worden automatisch ingevuld, tot en met de naam en het telefoonnummer van de uitvoerder die langskomt. Je vult alleen aan wat niet in het dossier staat, zoals de omschrijving van de werkzaamheden of een garantietermijn, en ziet meteen een voorbeeld. Daarna kun je de PDF downloaden, het document mailen vanaf je eigen Outlook, of het met "Bewerken in Word" openen in Word Online om er nog iets aan te veranderen. Alles wat je opstelt wordt bewaard in de dossiermap op SharePoint en blijft zichtbaar in de lijst, zodat je later kunt zien wat er wanneer naar wie is gestuurd — of er met één klik een nieuwe versie van maken.'
 where titel = 'Documenten opstellen vanuit het dossier'
   and datum = '2026-07-16';
