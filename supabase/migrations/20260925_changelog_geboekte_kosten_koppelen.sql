-- Changelog: het geboekte-kosten-item noemt nu ook het koppelvenster met alle orders/contracten.
update public.changelog
set omschrijving = 'Bij Geboekte kosten kies je de bewakingscode nu direct in de kolom Bewakingscode, net als bij Uren. Met de knop Koppelen aan order/contract zie je meteen alle inkooporders en onderaannemerscontracten van het dossier onder elkaar en koppel je de kost met één klik. Kosten uit een inkooporder of onderaannemerscontract blijven vast op de code van dat contract.'
where titel = 'Geboekte kosten verplaatsen vanuit de tabel' and datum = '2026-09-24';
