-- Changelog: het behandelscherm van de mailintake heeft een vaste indeling.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-10-01','verbeterd','Mailintake','Het behandelscherm heeft altijd dezelfde indeling',
   'De velden stonden per soort mail op een andere plek, waardoor je elke keer moest zoeken. '
   || 'Nu staan dezelfde elf onderdelen altijd in dezelfde volgorde, en zegt de kleur wat er aan '
   || 'de hand is: groen klopt, oranje even nakijken, rood ontbreekt nog, grijs speelt bij dit '
   || 'bericht geen rol. Nieuw zijn de projectrollen — die vul je nu meteen in plaats van achteraf '
   || 'op het dossier — en een blok dat vooraf laat zien welke termijnen worden aangemaakt. Ook '
   || 'kun je een dossier nu opzoeken op ons offertenummer; dat werkte alleen op het dossiernummer.');
