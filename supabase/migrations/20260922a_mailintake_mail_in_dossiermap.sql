-- De mail zelf hoort ook in de dossiermap, niet alleen zijn bijlagen.
--
-- Een calculator die een dossier opent wil lezen wat de klant schreef: de vraag,
-- de toon, wie er in de cc stond. Dat stond tot nu toe alleen in EVA en in de
-- postbus, en na de bewaartermijn nergens meer -- terwijl het dossier juist de
-- bewaarplaats hoort te zijn.
--
-- Twee kolommen, gespiegeld aan `mailintake_bijlagen`: het moment waarop het
-- gelukt is, en het SharePoint-item. Leeg + een dossier betekent "moet nog", en
-- dat is precies waar de bewakingscron op zoekt.
alter table public.mailintake_berichten
  add column if not exists mail_naar_sharepoint_op timestamptz,
  add column if not exists mail_sharepoint_item_id text;

comment on column public.mailintake_berichten.mail_naar_sharepoint_op is
  'Moment waarop de mail zelf (.eml) in de SharePoint-dossiermap is gezet. Leeg terwijl er een dossier_id staat = nog te doen; de bewakingscron pikt dat op.';

-- Alleen de openstaande gevallen; de index blijft zo klein ook als de tabel groeit.
create index if not exists idx_mailintake_berichten_mail_open
  on public.mailintake_berichten (dossier_id)
  where dossier_id is not null and mail_naar_sharepoint_op is null;
