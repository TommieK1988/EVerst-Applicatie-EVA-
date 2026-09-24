-- Meerwerk: termijnkeuze "1 termijn 100%" naast "Volg offerte termijnstaat" (een_regel).
--
-- `een_termijn` zet het hele meerwerkbedrag als één termijn in de Bouw7-termijnstaat, ook als de
-- meerwerkofferte een betalingsschema (bijv. 30/30/30/10) kent. `eigen_termijnstaat` blijft
-- toegestaan voor bestaande regels maar wordt in EVA niet meer aangeboden.

alter table public.meerwerk_regels
  drop constraint if exists meerwerk_regels_termijn_wijze_check;

alter table public.meerwerk_regels
  add constraint meerwerk_regels_termijn_wijze_check
  check (termijn_wijze in ('eigen_termijnstaat', 'een_regel', 'een_termijn'));
