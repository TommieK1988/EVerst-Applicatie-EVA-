-- Changelog: meerwerkoverzicht als PDF + decimalen in een meerwerkregel.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-01','nieuw','Meerwerk','Meerwerkoverzicht als PDF voor de klant',
   'In de tab Meerwerk zit een knop Overzicht (PDF). Je krijgt een overzicht voor de opdrachtgever met een eigen koptekst, gegroepeerd en opgeteld per status, met per regel het bedrag exclusief btw, het btw-percentage en het bedrag inclusief btw. Staan er meerdere btw-tarieven in, dan komt er onderaan een specificatie per tarief. Is er briefpapier gekoppeld aan de offerte-layout, dan komt het overzicht daarop te staan.'),
  ('2026-09-01','opgelost','Meerwerk','Decimalen invoeren bij een nieuwe meerwerkregel',
   'In het formulier voor een nieuwe meerwerkregel verdween de komma zodra je hem typte, waardoor je alleen hele bedragen kwijt kon. Je kunt nu gewoon 1.250,50 invoeren, met een komma of een punt.');
