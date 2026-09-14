-- =====================================================================
-- Melding-signalen — het geheugen van de dagelijkse meldingen
-- =====================================================================
-- De dagsignalen-cron (`/api/cron/dagsignalen`) draait twee keer per werkdag
-- en zou zonder geheugen elke run dezelfde melding opnieuw sturen. Deze tabel
-- onthoudt per medewerker en per soort wát er de vorige keer gemeld is.
--
-- De kern is `sleutel`: een korte samenvatting van de toestand waarover
-- gemeld is ("3 acties vandaag, 1 te laat", of de vingerafdruk van je
-- planning). Is de sleutel gelijk aan de vorige run, dan is er niets nieuws
-- en blijft de telefoon stil. Verandert hij, dan is er wél iets veranderd en
-- mag de melding eruit. Dat maakt de frequentie van de cron ongevaarlijk:
-- vaker draaien geeft niet meer meldingen, alleen een snellere reactie.
--
-- `stand` bewaart daarnaast de volledige vorige toestand waar een melding
-- moet kunnen vertéllen wát er veranderde. Voor de planning is dat het
-- verschil tussen twee momentopnamen; een hash alleen zegt "er is iets
-- gewijzigd" en dat is als melding waardeloos.

create table if not exists public.melding_signalen (
  medewerker_id    uuid not null references public.medewerkers(id) on delete cascade,
  -- 'taak_deadline' | 'planning' | 'uren_week' | 'uren_fiatteren'
  soort            text not null,
  sleutel          text not null,
  stand            jsonb,
  laatst_gemeld_op timestamptz not null default now(),
  primary key (medewerker_id, soort)
);

-- Geen policies: net als push_abonnementen is dit puur machinerie achter de
-- service-role. Er is geen scherm dat deze rijen leest.
alter table public.melding_signalen enable row level security;

comment on table public.melding_signalen is
  'Dedupe-geheugen van de dagsignalen-cron: per medewerker en soort de laatst gemelde toestand.';
comment on column public.melding_signalen.sleutel is
  'Samenvatting van de gemelde toestand. Gelijk aan vorige run = niets nieuws = geen melding.';
comment on column public.melding_signalen.stand is
  'Volledige vorige toestand, voor meldingen die het verschil moeten benoemen (planning).';
