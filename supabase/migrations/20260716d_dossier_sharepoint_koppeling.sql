-- 20260716d — SharePoint-dossiermap: handmatig koppelen + negatieve cache met TTL
--
-- Aanleiding: de automatische match zoekt uitsluitend in de container uit
-- O365_DOSSIER_DRIVE_ID (/sites/DeRekenkamer/.../Calculaties/Begrotingen). Voor
-- dossiers zonder calculatie bestaat daar simpelweg geen map, en het negatieve
-- resultaat bleef vervolgens voor eeuwig gecachet. Twee kolommen erbij:
--
--   sharepoint_handmatig   — beschermt een menselijke keuze tegen een auto-rematch
--   sharepoint_gematcht_op — laat 'niet_gevonden'/'meerdere' na een TTL verlopen,
--                            zodat een later aangemaakte map vanzelf gevonden wordt
--
-- Bewust een boolean i.p.v. een extra match_status-waarde: een handmatig gekozen
-- map is nog steeds 'gematcht', dus alle bestaande status-checks blijven werken.
-- Volgt het precedent van facturatiemethode_handmatig.

alter table public.dossiers
  add column if not exists sharepoint_handmatig   boolean not null default false,
  add column if not exists sharepoint_gematcht_op timestamptz;

comment on column public.dossiers.sharepoint_handmatig is
  'true = map handmatig gekozen/aangemaakt door een medewerker; een automatische (her)match overschrijft deze koppeling nooit.';

comment on column public.dossiers.sharepoint_gematcht_op is
  'Moment van de laatste match-poging. Negatieve statussen (niet_gevonden/meerdere) verlopen na een TTL en worden dan opnieuw geprobeerd.';

comment on column public.dossiers.sharepoint_match_status is
  'gematcht | niet_gevonden | meerdere | null. Negatieve statussen zijn een cache met TTL — zie sharepoint_gematcht_op.';

alter table public.dossiers drop constraint if exists dossiers_sharepoint_match_status_check;
alter table public.dossiers add constraint dossiers_sharepoint_match_status_check
  check (sharepoint_match_status is null or sharepoint_match_status in ('gematcht', 'niet_gevonden', 'meerdere'));

-- Eenmalig: negatieve caches wissen zodat de herschreven matchlogica opnieuw probeert.
-- Bestaande 'gematcht'-rijen blijven ongemoeid.
update public.dossiers
   set sharepoint_match_status = null,
       sharepoint_gematcht_op  = null
 where sharepoint_match_status in ('niet_gevonden', 'meerdere');
