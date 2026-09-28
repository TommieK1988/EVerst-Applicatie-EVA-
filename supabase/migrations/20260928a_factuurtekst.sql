-- Eigen factuurtekst per post (bewakingscode) in de Factuurregels-popup.
--
-- Platte tekst zoals de gebruiker hem intypt. Bij het klaarzetten wordt hij omgezet naar de
-- opmaak die Bouw7 zelf gebruikt (<p> per regel, <p>&nbsp;</p> voor een lege regel) en gaat hij
-- als `description` mee op de conceptfactuur. Leeg = de standaardtekst "Nacalculatie — <post>".
alter table public.factuur_regelinstellingen
  add column if not exists factuurtekst text;

comment on column public.factuur_regelinstellingen.factuurtekst is
  'Platte factuurtekst voor deze post; gaat omgezet naar Bouw7-HTML als description op de conceptfactuur.';
