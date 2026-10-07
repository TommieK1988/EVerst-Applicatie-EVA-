-- Overuren als automatische, negatieve tijd-voor-tijdregel.
--
-- Wie meer werkt dan zijn contract, krijgt in de weekstaat vanzelf een regel "Tijd voor tijd" met
-- min de overuren, zodat het weektotaal precies op de contracturen uitkomt (de vierkantscontrole in
-- Bouw7 en de loonadministratie). Het saldo rekent ongewijzigd: de view uren_week_saldo telt tijd
-- voor tijd niet mee, dus de overuren komen er net als vroeger als +x bij.
--
-- Negatieve uren mogen alleen op die automatische regel; alles wat een mens invult blijft > 0.

alter table public.uren_regels drop constraint if exists uren_regels_bron_check;
alter table public.uren_regels add constraint uren_regels_bron_check
  check (bron = any (array['eva', 'planning', 'bouw7_verlof', 'bouw7_feestdag', 'auto_overuren']));

alter table public.uren_regels drop constraint if exists uren_regels_uren_check;
alter table public.uren_regels add constraint uren_regels_uren_check
  check (
    (uren > 0 and uren <= 24)
    or (bron = 'auto_overuren' and uren < 0 and uren >= -24)
  );

-- Welke uursoort goedgekeurd verlof heeft. Het enum `type` kent alleen verlof/ziek/training/overig;
-- daaruit raadde de weekstaat de uursoort, waardoor tijd-voor-tijdverlof als vakantie werd
-- voorgevuld. Met de uursoort van de aanvraag erbij is dat raden niet meer nodig.
alter table public.medewerker_afwezigheid
  add column if not exists uursoort_id uuid references public.planning_uursoorten(id) on delete restrict;
