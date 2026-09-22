-- Regiewerkzaamheden: één eigen bewakingscode per servicedeskbon die op regie afrekent.
--
-- Waarom dit nodig is: servicedeskprojecten hebben in Bouw7 helemaal geen bewakingscodes — alles
-- landt onder `uncoded_costs`. Daardoor is er niets om op in te kopen, niets om uren op te boeken
-- en heeft de nacalculatie geen post om een verkoopfactuur van te maken. Eén code per bon lost dat
-- op zonder de calculatiestructuur van een opdracht op te tuigen.
--
-- Drie kolommen, spiegelbeeld van `opdracht_onderdelen`: de kale code die EVA uitdeelt, plus de
-- Bouw7-sleutels die bij het aanmaken terugkomen. `regie_bouw7_chapter_id` gevuld = de code staat
-- écht in Bouw7; blijft hij leeg terwijl de code er wel is, dan is de Bouw7-write mislukt en kan er
-- nog niets op geboekt worden.
alter table public.dossiers
  add column if not exists regie_bewakingscode           text,
  add column if not exists regie_bouw7_chapter_id        bigint,
  add column if not exists regie_bouw7_security_code_id  bigint;

comment on column public.dossiers.regie_bewakingscode is
  'Bewakingscode "Regiewerkzaamheden" van een servicedeskbon op regie (kale code, bijv. RW01). Leeg = nog niet uitgedeeld.';
comment on column public.dossiers.regie_bouw7_chapter_id is
  'Bouw7-hoofdstuk waar de regiecode onder is aangemaakt. Leeg terwijl de code gevuld is = de Bouw7-write is mislukt.';
comment on column public.dossiers.regie_bouw7_security_code_id is
  'Bouw7 project-security-link (PSL) van de regiecode op de kostensoort Arbeid; terugleesbaar na aanmaken.';
