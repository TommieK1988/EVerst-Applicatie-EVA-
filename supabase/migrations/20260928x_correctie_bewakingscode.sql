-- Correcties: een eigen kostengroep (CO01) per dossier om de prognose bij te stellen voor de
-- maandcijfers, zonder de kostengroepen te raken waar de uitvoering op stuurt.
--
-- Waarom: klopt de prognose van een project niet, dan moest Projectbureau tot nu toe een bestaande
-- kostengroep ophogen of verlagen — en daarmee verschoof ongemerkt het urenbudget van de
-- uitvoerder (urensaldo, werkvoorraad, planning). Een aparte groep houdt die twee gescheiden: hij
-- telt mee in de Bouw7-projecttotalen, maar EVA laat hem in elk uitvoeringsscherm weg.
--
-- Zelfde drie kolommen als de regiecode (20260922c): de kale code die EVA uitdeelt, plus de
-- Bouw7-sleutels die bij het aanmaken terugkomen. `correctie_bouw7_chapter_id` gevuld = de code
-- staat écht in Bouw7.
alter table public.dossiers
  add column if not exists correctie_bewakingscode           text,
  add column if not exists correctie_bouw7_chapter_id        bigint,
  add column if not exists correctie_bouw7_security_code_id  bigint;

comment on column public.dossiers.correctie_bewakingscode is
  'Bewakingscode "Correcties" (kale code, CO01). Leeg = niet aangemaakt op dit dossier.';
comment on column public.dossiers.correctie_bouw7_chapter_id is
  'Bouw7-hoofdstuk waar de correctiecode onder is aangemaakt. Leeg terwijl de code gevuld is = de Bouw7-write is mislukt.';
comment on column public.dossiers.correctie_bouw7_security_code_id is
  'Bouw7 project-security-link (PSL) van de correctiecode op de kostensoort Arbeid.';

-- Het recht `dossiers.correcties` (functie, alleen desktop). Projectbureau krijgt hem op
-- afdelingsniveau; Directie heeft hem als beheerder al. Collega's met de functie Administratie
-- zitten in de afdeling Ondersteunend (die hem níét krijgt) en hebben een eigen rechtenset — die
-- krijgen hem per persoon. Later in- of uitschakelen gaat op het rechtenscherm.
update public.medewerker_afdelingen
   set rechten = jsonb_set(rechten, '{desktop,functies,dossiers.correcties}', 'true'::jsonb, true)
 where naam = 'Projectbureau'
   and rechten ? 'desktop';

update public.medewerkers
   set rechten = jsonb_set(rechten, '{desktop,functies,dossiers.correcties}', 'true'::jsonb, true)
 where functie = 'Administratie'
   and rechten ? 'desktop';
