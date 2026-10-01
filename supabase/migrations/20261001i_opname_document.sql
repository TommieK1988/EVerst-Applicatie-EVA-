-- Opnamedocument: een prijsloze PDF van de opname, automatisch gemaakt bij afronden, in de
-- SharePoint-dossiermap gezet en vrijgegeven in de app (dossier_bestand_app_zichtbaar).
--
-- De velden houden bij wáár het document staat en of het lukte, zodat de Opname-tab een link of
-- een waarschuwing kan tonen. Het bestand zelf leeft alleen in SharePoint.
-- Additief: een draaiende build die deze kolommen niet kent, merkt er niets van.

alter table public.opnames
  add column if not exists document_sharepoint_item_id text,
  add column if not exists document_web_url text,
  add column if not exists document_gemaakt_op timestamptz,
  add column if not exists document_fout text;

comment on column public.opnames.document_sharepoint_item_id is
  'SharePoint-item van het opnamedocument (prijsloze PDF). App-sleutel = sharepoint:<item_id>.';
comment on column public.opnames.document_fout is
  'Laatste fout bij het maken/archiveren van het opnamedocument; null = gelukt of nog niet geprobeerd.';
