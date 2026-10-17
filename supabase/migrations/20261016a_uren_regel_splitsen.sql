-- Uren-goedkeuring: een urenregel splitsen of er een bij zetten.
--
-- Tot nu toe kon de goedkeurder een regel alleen aanpassen: uren, uursoort, dossier, code. Een dag
-- die over twee dossiers (of twee uursoorten) verdeeld had moeten worden, kon hij niet rechtzetten
-- -- daar zijn twee regels voor nodig, en hij kon er geen maken. Nu wel: de nieuwe regel wordt in
-- Bouw7 aangemaakt en de oude gaat met hetzelfde aantal uren omlaag.
--
-- Bouw7 legt niet vast wie een regel heeft aangemaakt; voor Bouw7 is het gewoon een uurregel van
-- de medewerker. Zonder deze kolommen zou achteraf niet te zien zijn dat die regel niet van de
-- medewerker zelf komt, en waar hij uit is ontstaan.
--
-- Een rij in deze tabel bestaat al per uurregel die iemand in EVA heeft aangeraakt. Een door de
-- goedkeurder gemaakte regel krijgt er meteen een, met de stempels hieronder.

alter table public.uren_bouw7_beoordeling
  add column if not exists aangemaakt_op   timestamptz,
  add column if not exists aangemaakt_door uuid references public.medewerkers(id) on delete set null,
  add column if not exists afgesplitst_van bigint;

comment on column public.uren_bouw7_beoordeling.aangemaakt_op is
  'Gevuld als de goedkeurder deze uurregel in EVA heeft aangemaakt (splitsen of erbij zetten), niet de medewerker zelf.';
comment on column public.uren_bouw7_beoordeling.aangemaakt_door is
  'De goedkeurder die deze uurregel aanmaakte.';
comment on column public.uren_bouw7_beoordeling.afgesplitst_van is
  'Bouw7 hour-log-id van de regel waar deze uit is afgesplitst; die ging met evenveel uren omlaag. Leeg als de uren erbij kwamen.';
