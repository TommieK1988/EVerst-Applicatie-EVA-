-- Tijdelijke vertalingen voor EVA Mobiel (/m).
--
-- Teksten van kantoor (taken, planningnotities, meldingen, handboek, toolboxen,
-- formulieren) ziet een Poolse of Tamil monteur automatisch vertaald. Elke tekst wordt
-- één keer per taal vertaald en hier bewaard; de Nederlandse tekst blijft de echte.
--
-- sleutel = sha256(doeltaal + promptversie + brontekst). Verandert kantoor de tekst, dan
-- verandert de sleutel en komt er vanzelf een nieuwe vertaling.
--
-- Tijdelijk: rijen die 30 dagen niet gebruikt zijn ruimt de cron fouten-opruimen op,
-- tenzij `vastgezet` (een nagekeken vertaling die moet blijven).
--
-- Alleen de server leest en schrijft (service-role); RLS aan zonder policies.
-- Zie docs/plan-meertaligheid-app.md.

create table if not exists public.vertaal_cache (
  sleutel             text primary key,
  doeltaal            text not null check (doeltaal in ('nl', 'pl', 'ta')),
  vertaling           text not null,
  model               text,
  vastgezet           boolean not null default false,
  aangemaakt_op       timestamptz not null default now(),
  laatst_gebruikt_op  timestamptz not null default now()
);

create index if not exists vertaal_cache_laatst_gebruikt_idx
  on public.vertaal_cache (laatst_gebruikt_op)
  where not vastgezet;

alter table public.vertaal_cache enable row level security;

comment on table public.vertaal_cache is
  'Tijdelijke machinevertalingen van kantoorteksten voor EVA Mobiel (nl/pl/ta). Na 30 dagen ongebruikt opgeruimd.';
