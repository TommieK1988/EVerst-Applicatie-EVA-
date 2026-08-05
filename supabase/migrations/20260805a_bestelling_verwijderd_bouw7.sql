-- Een inkooporder / onderaannemersopdracht die EVA in Bouw7 aanmaakte, kan daarna in Bouw7
-- worden weggegooid. EVA merkte dat niet: de inkoop bleef staan als stond hij er nog, en de
-- onderliggende regels bleven geblokkeerd voor een nieuwe inkoop.
--
-- Deze kolom legt vast dát het is gebeurd. De koppelvelden (bouw7_contract_id, leverbon) worden
-- bij die constatering leeggemaakt — daarmee zijn de regels weer bestelbaar — maar bouw7_nummer
-- blijft staan zodat de gebruiker ziet wélk document verdwenen is.

alter table public.werkbegroting_bestellingen
  add column if not exists bouw7_verwijderd_op timestamptz;

comment on column public.werkbegroting_bestellingen.bouw7_verwijderd_op is
  'Gevuld zodra EVA vaststelt dat het Bouw7-contract niet meer bestaat (in Bouw7 verwijderd). '
  'De inkoop blijft in EVA zichtbaar als historie, maar telt niet meer als besteld.';
