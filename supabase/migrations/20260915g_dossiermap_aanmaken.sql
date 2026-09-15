-- Dossiermap in SharePoint: EVA maakt hem zelf aan en houdt de naam bij.
--
-- Tot nu toe ging de Bestanden-tab ervan uit dat de map al bestond. De container is
-- historisch een calculatie-archief, dus voor een nieuwe aanvraag stond er simpelweg
-- niets. Voortaan krijgt elke in EVA aangemaakte aanvraag meteen een eigen map
-- `{dossiernummer} - {titel}`, en wijzigt de projectnaam (in EVA of via Bouw7), dan
-- gaat de mapnaam mee.
--
-- `sharepoint_map_naam` is de kern van dat meebewegen: het is de naam die EVA zélf
-- heeft geschreven. Leeg betekent dat de map is gematcht of met de hand gekozen — een
-- bestaande archiefmap met een eigen naam — en die hernoemt EVA nooit stilletjes.
-- Alleen kijken of de naam met het dossiernummer begint is daarvoor niet genoeg: in
-- dat archief begint vrijwel elke map met het nummer.

alter table public.dossiers
  add column if not exists sharepoint_map_naam    text,
  add column if not exists sharepoint_map_gewenst boolean not null default false;

comment on column public.dossiers.sharepoint_map_naam is
  'De mapnaam zoals EVA hem in SharePoint heeft gezet (bij aanmaken of hernoemen). Leeg = de map is gematcht of handmatig gekozen; die hernoemt EVA nooit.';
comment on column public.dossiers.sharepoint_map_gewenst is
  'true = deze aanvraag is in EVA aangemaakt en hoort een eigen dossiermap te krijgen. Blijft true tot sharepoint_item_id gevuld is, zodat de naloop de map alsnog aanmaakt zodra het dossiernummer uit Bouw7 binnen is. Bestaande dossiers houden false — geen backfill.';

-- Apart statement: de generated expression verwijst naar de kolom die hierboven pas
-- wordt toegevoegd.
alter table public.dossiers
  add column if not exists sharepoint_map_naam_verouderd boolean
    generated always as (
      sharepoint_map_naam is not null
      and dossiernummer is not null
      and sharepoint_map_naam is distinct from (coalesce(dossiernummer, '') || ' - ' || coalesce(titel, ''))
    ) stored;

comment on column public.dossiers.sharepoint_map_naam_verouderd is
  'Grove voorselectie voor de hernoem-naloop: de opgeslagen mapnaam wijkt af van {dossiernummer} - {titel}. Bewust ruw (kent saneerMapNaam niet) — de TypeScript-kant rekent de gewenste naam exact uit en slaat over als hij tóch gelijk is. Een vals-positief kost een overgeslagen rij, nooit een gemiste hernoeming.';

-- Partieel: zonder deze indexen zijn beide nalopen een full scan op dossiers.
create index if not exists dossiers_sp_map_verouderd_idx
  on public.dossiers (id) where sharepoint_map_naam_verouderd;

create index if not exists dossiers_sp_map_gewenst_idx
  on public.dossiers (id) where sharepoint_map_gewenst and sharepoint_item_id is null;
