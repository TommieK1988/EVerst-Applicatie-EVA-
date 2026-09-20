-- Kerstkaart-markering op de contactpersoon.
--
-- De kerstkaartlijst leefde tot nu toe in een Excel buiten EVA (de kolom `Kerst` in
-- "2025-09-03 Contactpersonen.xlsx", die voor alle 363 rijen op "Ja" stond). Daardoor was in
-- EVA niet te zien wie een kaart krijgt, en moest de lijst elk jaar met de hand worden
-- bijgehouden. Dit veld haalt die markering het systeem in.
--
-- Additief en met een default, zodat draaiende productiecode die de kolom nog niet kent gewoon
-- blijft werken. Bouw7 kent dit veld niet; het is puur van EVA en de sync raakt het niet aan.

alter table public.contactpersonen
  add column if not exists kerstkaart boolean not null default false;

comment on column public.contactpersonen.kerstkaart is
  'Krijgt deze contactpersoon de kerstkaart? Alleen EVA; komt niet uit Bouw7.';

-- Gericht kunnen opvragen wie er op de lijst staat, zonder de hele tabel te scannen.
create index if not exists contactpersonen_kerstkaart_idx
  on public.contactpersonen (kerstkaart)
  where kerstkaart;
