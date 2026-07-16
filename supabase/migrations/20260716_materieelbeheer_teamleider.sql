-- Materieelbeheer — teamleider per team
--
-- Een team/ploeg/bus zonder verantwoordelijke voegt weinig toe: er moet iemand
-- aanspreekbaar zijn voor het materieel dat aan het team hangt. Daarom een
-- teamleider (medewerker) op materieel_teams.
--
-- Additief: alleen een nieuwe, nullable kolom.

alter table public.materieel_teams
  add column if not exists teamleider_id uuid references public.medewerkers(id) on delete set null;

comment on column public.materieel_teams.teamleider_id is
  'Verantwoordelijke medewerker voor het materieel van dit team/ploeg/bus.';
