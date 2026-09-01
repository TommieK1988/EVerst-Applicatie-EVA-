-- Interne notitie van de verkoopfactuur uit Bouw7 (`InvoiceListItem.note` /
-- `InvoiceDocument.internalNote`). De administratie noteert daar het debiteurencontact
-- ("25-8-26, gesproken met Franklin: staat klaar voor betaling"), precies de informatie die op
-- het Facturen-scherm ontbrak. Bouw7 levert rich text; we slaan platte tekst op — de weergave
-- rendert bewust geen HTML.
alter table public.debiteuren
  add column if not exists interne_notitie text;

comment on column public.debiteuren.interne_notitie is
  'Interne notitie van de factuur in Bouw7 (platte tekst). Two-way: de sync leest hem, en een nieuwe logboekregel in EVA wordt in Bouw7 aan deze notitie toegevoegd.';
