-- Werkvoorraad: capaciteit per uursoort vs. nog uit te voeren arbeidsuren.

-- 1. Medewerker → uitvoerende discipline (uursoort) voor capaciteitsgroepering.
alter table public.medewerkers
  add column if not exists standaard_uursoort_id uuid null
    references public.planning_uursoorten(id) on delete set null;

comment on column public.medewerkers.standaard_uursoort_id is
  'Standaard uursoort/discipline van de medewerker; bepaalt onder welke groep zijn capaciteit valt in de Werkvoorraad-weergave.';

-- 2. Arbeidsuren per project (kostensoort 1, Arbeid), gevuld door syncManagementProjecten.
--    Werkvoorraad (nog uit te voeren) = prognose - geboekt, afgeleid in de query.
alter table public.management_projecten
  add column if not exists arbeid_prognose_uren numeric null,
  add column if not exists arbeid_geboekte_uren numeric null;

comment on column public.management_projecten.arbeid_prognose_uren is
  'Prognose arbeidsuren (Bouw7 project-control kostensoort 1, som over bewakingscodes).';
comment on column public.management_projecten.arbeid_geboekte_uren is
  'Geboekte arbeidsuren (Bouw7 project-control kostensoort 1, som over bewakingscodes).';
