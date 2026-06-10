-- planning_secties: hoofdstukken / groepen voor het ordenen van taken per dossier
create table if not exists public.planning_secties (
  id          uuid        primary key default gen_random_uuid(),
  dossier_id  uuid        not null references public.dossiers(id) on delete cascade,
  naam        text        not null,
  volgorde    int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger tg_planning_secties_updated_at
  before update on public.planning_secties
  for each row execute function public.tg_set_updated_at();

-- Voeg sectie_id toe aan planning_taken
alter table public.planning_taken
  add column if not exists sectie_id uuid references public.planning_secties(id) on delete set null;

-- planning_taak_afhankelijkheden: FS / SS / FF / SF afhankelijkheden tussen taken
-- FS = Einde → Start (default, meest gebruikelijk)
-- SS = Start  → Start
-- FF = Einde  → Einde
-- SF = Start  → Einde (zeldzaam)
create table if not exists public.planning_taak_afhankelijkheden (
  id               uuid        primary key default gen_random_uuid(),
  van_taak_id      uuid        not null references public.planning_taken(id) on delete cascade,
  naar_taak_id     uuid        not null references public.planning_taken(id) on delete cascade,
  type             text        not null default 'FS'
                               check (type in ('FS', 'SS', 'FF', 'SF')),
  vertraging_dagen int         not null default 0,
  constraint no_self_dependency check (van_taak_id <> naar_taak_id),
  unique (van_taak_id, naar_taak_id),
  created_at       timestamptz not null default now()
);

-- Indexes
create index if not exists idx_planning_secties_dossier    on public.planning_secties(dossier_id);
create index if not exists idx_planning_taken_sectie        on public.planning_taken(sectie_id);
create index if not exists idx_afhankelijkheden_van_taak    on public.planning_taak_afhankelijkheden(van_taak_id);
create index if not exists idx_afhankelijkheden_naar_taak   on public.planning_taak_afhankelijkheden(naar_taak_id);
