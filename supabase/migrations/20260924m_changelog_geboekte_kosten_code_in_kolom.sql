-- Changelog: bewakingscode van een geboekte kost direct in de kolom kiezen.
insert into public.changelog (datum, categorie, module, titel, omschrijving) values
  ('2026-09-24','verbeterd','Dossiers','Geboekte kosten verplaatsen vanuit de tabel',
   'Bij Geboekte kosten kies je de bewakingscode nu direct in de kolom Bewakingscode, net als bij Uren. Je hoeft daarvoor niet meer via Corrigeren. Kosten uit een inkooporder of onderaannemerscontract blijven vast op de code van dat contract.');
