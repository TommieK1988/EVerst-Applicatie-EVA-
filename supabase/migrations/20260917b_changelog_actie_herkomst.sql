-- Changelog-item bij de herkomst van een actie (wie hem aanmaakte / uit welke actielijst).
-- Toegepast ná de merge naar main (zie CLAUDE.md: elk gepubliceerd item is direct
-- voor iedereen zichtbaar, ongeacht op welke branch de code staat).

insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-17','verbeterd','Acties','Bij elke actie zie je nu waar hij vandaan komt',
   'Open je een actie, dan staat onder de titel uit welke actielijst hij komt, wie hem heeft aangemaakt en wanneer. Kwam de actie niet van een collega, dan zie je de bron: Bouw7, het postvak, of "Automatisch" als EVA hem zelf heeft klaargezet. Op de Acties-tab van het dossier is "Aangemaakt door" er ook als kolom bij gekomen, met een filter erop; in Mijn acties en het acties-overzicht kun je die kolom aanzetten via het kolombeheer. Bij actielijsten die je vanaf nu activeert komt jouw naam erbij te staan, zodat je kunt zien wie de lijst heeft klaargezet.');
