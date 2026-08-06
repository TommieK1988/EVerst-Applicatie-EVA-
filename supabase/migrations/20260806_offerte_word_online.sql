-- Offerte bewerken in Word Online
--
-- Een offerte kan een bewerkbaar Word-document in de SharePoint-dossiermap krijgen.
-- Zolang die koppeling bestaat is DAT bestand de bron voor de PDF (voorvertoning,
-- download en verzending) — niet meer het layout-sjabloon. Zo blijft een handmatig
-- bijgewerkte offerte binnen EVA: goedkeuring, verzenden en archivering blijven werken.
--
-- word_drive_id/_item_id/_web_url : driveItem in SharePoint (zelfde patroon als dossier_documenten)
-- word_etag                       : versiemarker van SharePoint (cTag); voedt de goedkeurings-hash,
--                                   zodat bewerken ná goedkeuring een nieuwe goedkeuring afdwingt
-- word_inhoud_hash                : offerte-inhoud op het moment dat het document werd opgesteld;
--                                   wijkt die af van nu, dan is het Word-document verouderd
-- word_gesynct_op                 : laatste keer dat EVA de versie bij SharePoint ophaalde

alter table quotes
  add column if not exists word_drive_id text,
  add column if not exists word_item_id text,
  add column if not exists word_web_url text,
  add column if not exists word_bestandsnaam text,
  add column if not exists word_etag text,
  add column if not exists word_inhoud_hash text,
  add column if not exists word_gesynct_op timestamptz,
  add column if not exists word_gemaakt_door uuid,
  add column if not exists word_gemaakt_op timestamptz;

comment on column quotes.word_item_id is
  'SharePoint driveItem van het bewerkbare Word-document. Gevuld = dit bestand is de bron voor de offerte-PDF.';
comment on column quotes.word_etag is
  'cTag van het SharePoint-bestand; onderdeel van de goedkeurings-hash zodat een Word-bewerking de goedkeuring verloopt.';
