-- Een verkoopkans wijst naar een object, net als de klant.
--
-- Klant en object beantwoorden verschillende vragen: de klant is wie je belt, het object is
-- waar het werk zit. Bij een beheerder met dertig complexen is "VvE Beheer X" over een jaar
-- niet genoeg om te weten waar de kans over ging — dan zoek je in een oude offerte naar het
-- adres. Met het object erbij staat dat er meteen, en is de kans ook vanuit het object te
-- vinden.
--
-- Zelfde opzet als `relatie_id` (migratie 20260917d): los van `bron_dossier_id`, want een kans
-- kan zonder dossier bestaan, en het object van de kans hoeft niet dat van het brondossier te
-- zijn — een gesprek over complex A kan uit een offerte voor complex B komen.

alter table public.commercie_bewaking
  add column if not exists object_id uuid references public.vastgoed_objecten(id) on delete set null;

comment on column public.commercie_bewaking.object_id is
  'Het vastgoedobject waar een verkoopkans over gaat. Los van relatie_id en bron_dossier_id: wie je belt, waar het werk zit en waar de kans vandaan komt zijn drie verschillende dingen.';

create index if not exists commercie_bewaking_object_idx
  on public.commercie_bewaking (object_id) where object_id is not null;
