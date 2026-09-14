-- Uren-goedkeuring: vastleggen dat de projectleider de teamleiderstap heeft overgeslagen.
--
-- De keten is teamleider -> projectleider, en die volgorde wordt afgedwongen. Maar een
-- teamleider gaat ook met verlof, en dan mogen de uren van zijn ploeg niet wekenlang blijven
-- hangen. De projectleider kan er daarom overheen, ná een expliciete bevestiging.
--
-- Waarom aparte kolommen en niet gewoon `tl_akkoord_op` vullen: de teamleider heeft er dan
-- juist NIET naar gekeken. Dat als een akkoord van hem wegschrijven maakt de audit trail een
-- leugen -- precies het soort stilzwijgende aanname waar later niemand meer doorheen kijkt.
-- `tl_akkoord_op` blijft dus leeg en hiernaast staat wie de stap oversloeg, en wanneer.

alter table public.uren_bouw7_beoordeling
  add column if not exists tl_overgeslagen_op  timestamptz,
  add column if not exists tl_overgeslagen_door uuid references public.medewerkers(id);

comment on column public.uren_bouw7_beoordeling.tl_overgeslagen_op is
  'Moment waarop de projectleider de teamleiderstap oversloeg (bijv. bij verlof). tl_akkoord_op blijft dan leeg.';
comment on column public.uren_bouw7_beoordeling.tl_overgeslagen_door is
  'De projectleider die de teamleiderstap oversloeg.';
