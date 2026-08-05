insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-08-05','opgelost','Inkoop','Verwijderd in Bouw7 is nu ook in EVA verwijderd',
   'Gooide je een inkooporder of onderaannemersopdracht weg in Bouw7, dan bleef hij in EVA staan alsof hij er nog was — en waren de bijbehorende regels geblokkeerd voor een nieuwe inkoop. EVA controleert dat nu bij het openen van het inkoopscherm. Is het document echt weg, dan wordt het gemarkeerd als "Verwijderd in Bouw7" en staan de regels weer bij "Nog te bestellen". Met één klik ruim je zo''n vervallen inkoop uit de lijst op.'),
  ('2026-08-05','verbeterd','Inkoop','Duidelijk verschil tussen opdracht en bestelling',
   'Het inkoopscherm van de werkbegroting heet nu Inkopen en toont opdrachten aan onderaannemers en bestellingen bij leveranciers in twee aparte blokken, elk met eigen kleur, pictogram en een regel uitleg. Ook in de lijst met bestaande inkopen zie je in één oogopslag om welk van de twee het gaat.');
