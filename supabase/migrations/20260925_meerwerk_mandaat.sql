-- Verkoopbedrag / mandaat bij regie-meerwerk en stelposten.
--
-- Regie en stelposten rekenen af op geboekte kosten (of eenheidsprijs x hoeveelheid). Vóór er iets
-- geboekt is telden ze daardoor als 0 in het contracttotaal, terwijl de klant vaak al een bedrag
-- heeft toegezegd. Dat bedrag komt hier. Het contracttotaal telt per regel het hoogste van mandaat
-- en werkelijk.
--
-- Bewust een eigen kolom en niet bedrag_excl_btw: bij uit Bouw7 geïmporteerde stelposten staat
-- daar de Bouw7-`cost`, die tot nu toe niet meetelde. Hergebruik zou die stil activeren.
alter table public.meerwerk_regels
  add column if not exists mandaat_excl_btw numeric(12,2);

comment on column public.meerwerk_regels.mandaat_excl_btw is
  'Verkoopbedrag/mandaat excl. btw bij regie en stelposten; telt in contracttotaal als max(mandaat, werkelijk). EVA-veld.';
