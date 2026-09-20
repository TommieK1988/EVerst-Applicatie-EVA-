-- =====================================================================
-- Wanneer verdween deze Bouw7-contactpersoon?
-- =====================================================================
--
-- `syncContacts` ruimde wél relaties op die uit Bouw7 verdwijnen, maar contactpersonen niet.
-- Daardoor bleven 65 verwijderde contactpersonen in EVA staan — tientallen VvE's die ooit als
-- "contactpersoon" onder hun beheerder waren aangemaakt, plus medewerkers die allang uit dienst
-- zijn. Ze stonden gewoon in elke keuzelijst.
--
-- De sterfdatum hoort op de **spiegel**, niet op de mens. Bouw7 dupliceert iemand per bedrijf;
-- wie bij bedrijf A verdwijnt maar bij B blijft werken, is nog gewoon actief. Pas als álle
-- spiegels van een persoon verdwenen zijn, gaat de persoon zelf op inactief.
--
-- Komt een spiegel later terug in de Bouw7-respons, dan wordt dit veld weer leeggemaakt en leeft
-- de persoon op. Zonder dat zou een in Bouw7 hersteld record voor altijd inactief blijven.

alter table public.contactpersoon_bouw7_koppelingen
  add column if not exists verdwenen_op timestamptz;

comment on column public.contactpersoon_bouw7_koppelingen.verdwenen_op is
  'Eerste sync waarin Bouw7 deze contactpersoon niet meer teruggaf. Leeg = bestaat nog.';

-- Alleen de verdwenen spiegels hoeven een index; dat zijn er weinig ten opzichte van het geheel.
create index if not exists cp_b7_koppeling_verdwenen_idx
  on public.contactpersoon_bouw7_koppelingen (verdwenen_op) where verdwenen_op is not null;
