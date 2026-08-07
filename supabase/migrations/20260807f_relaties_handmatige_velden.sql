-- Handmatig in EVA aangepaste relatievelden beschermen tegen de Bouw7-lees-sync.
--
-- De volledige sync (cron 06:30) herschrijft elke relatie en contactpersoon met de
-- waarden uit Bouw7. Alles wat een gebruiker in EVA aanpaste werd daarmee de
-- volgende ochtend teruggedraaid — onder meer een leverancier die óók als
-- onderaannemer was aangemerkt, omdat Bouw7 maar één contacttype per relatie kent.
--
-- `handmatige_velden` houdt per rij bij welke kolommen in EVA zijn bewerkt; de
-- lees-sync laat die kolommen voortaan ongemoeid.
--
-- `bouw7_type` bewaart het laatst uit Bouw7 afgeleide organisatietype. Daarmee weet
-- de sync bij het samenvoegen van `types` welk type van Bouw7 kwam (en dus vervangen
-- mag worden) en welke types in EVA zijn toegevoegd (en dus moeten blijven staan).
-- Bewust niet gebackfilld: zolang `bouw7_type` leeg is houdt de sync álle bestaande
-- types vast, zodat er bij de eerste run niets verloren gaat.

alter table public.relaties
  add column if not exists handmatige_velden text[] not null default '{}'::text[],
  add column if not exists bouw7_type        text;

alter table public.contactpersonen
  add column if not exists handmatige_velden text[] not null default '{}'::text[];

comment on column public.relaties.handmatige_velden is
  'Kolomnamen die in EVA handmatig zijn aangepast; de Bouw7-lees-sync overschrijft deze niet meer.';
comment on column public.relaties.bouw7_type is
  'Laatst uit Bouw7 afgeleide organisatietype; basis voor het samenvoegen van types bij de sync.';
comment on column public.contactpersonen.handmatige_velden is
  'Kolomnamen die in EVA handmatig zijn aangepast; de Bouw7-lees-sync overschrijft deze niet meer.';
