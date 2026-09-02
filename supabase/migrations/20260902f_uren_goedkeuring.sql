-- Goedkeuring van weekstaten — met de Bouw7-route ernaast.
--
-- Het accorderen van uren gebeurt vandaag in Bouw7 zelf: iemand zet daar de vlag `isApproved`
-- op een uurregel. Dat moet blijven werken zolang de overstap loopt. EVA krijgt dus niet één
-- maar twee routes, en de instelling bepaalt welke geldt:
--
--   modus 'bouw7'  (de huidige praktijk, en de standaard)
--     Indienen stuurt de uren meteen naar Bouw7 met approved = false. Accorderen gebeurt daar.
--     EVA leest `isApproved` terug en zet de week op goedgekeurd zodra alle regels akkoord zijn.
--     De EVA-goedkeurschermen tonen die weken wel, maar alleen om mee te kijken.
--
--   modus 'eva'  (de nieuwe keten)
--     Indienen -> teamleider accordeert de hele week -> elke projectleider accordeert de regels op
--     zijn eigen dossiers -> pas dan gaan de uren naar Bouw7, ineens en met approved = true.
--
-- De modus staat bedrijfsbreed in uren_instellingen en is per ploeg te overschrijven, zodat je
-- met één ploeg kunt proefdraaien zonder de rest om te zetten.
--
-- Terugleessynchronisatie draait in BEIDE modi. Ook een week die EVA zelf goedkeurde kan in Bouw7
-- nog worden teruggedraaid; dan hoort EVA dat te tonen in plaats van een goedkeuring te blijven
-- claimen die er niet meer is.

alter table public.uren_instellingen
  add column if not exists goedkeuring_modus text not null default 'bouw7'
    check (goedkeuring_modus in ('eva','bouw7'));

comment on column public.uren_instellingen.goedkeuring_modus is
  'Waar weekstaten geaccordeerd worden. bouw7 = de huidige praktijk (accorderen in Bouw7, EVA leest terug); eva = de keten teamleider -> projectleiders in EVA. Per ploeg te overschrijven.';

alter table public.ploegen
  add column if not exists goedkeuring_modus text
    check (goedkeuring_modus in ('eva','bouw7'));

comment on column public.ploegen.goedkeuring_modus is
  'Overschrijft uren_instellingen.goedkeuring_modus voor deze ploeg. null = volg de bedrijfsinstelling. Bedoeld om met één ploeg proef te draaien.';

-- Hoe deze week uiteindelijk is goedgekeurd. Bewaard omdat het bij een verschil tussen EVA en
-- Bouw7 uitmaakt wie er gelijk had.
alter table public.uren_weken
  add column if not exists goedkeuring_modus text
    check (goedkeuring_modus in ('eva','bouw7'));

comment on column public.uren_weken.goedkeuring_modus is
  'De modus die gold toen deze week werd ingediend. Bevroren bij indienen: een latere omzetting mag een lopende week niet halverwege van route laten wisselen.';

-- Wat Bouw7 over de goedkeuring zegt. Los van de EVA-status: in modus 'bouw7' is dit de waarheid,
-- in modus 'eva' is het de bevestiging dat de vlag daadwerkelijk is aangekomen.
alter table public.uren_regels
  add column if not exists bouw7_goedgekeurd boolean not null default false,
  add column if not exists bouw7_goedgekeurd_op timestamptz,
  add column if not exists bouw7_goedgekeurd_door text;

comment on column public.uren_regels.bouw7_goedgekeurd is
  'De vlag isApproved zoals Bouw7 hem teruggeeft. In modus bouw7 bepaalt dit of de week goedgekeurd is.';

-- De regels waarvan we de Bouw7-goedkeuring nog moeten ophalen.
create index if not exists uren_regels_bouw7_wacht_idx
  on public.uren_regels (bouw7_hour_log_id)
  where bouw7_status = 'verzonden' and not bouw7_goedgekeurd;
