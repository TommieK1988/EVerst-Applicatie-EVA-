-- Singleton-tabel voor bedrijfsbrede instellingen (uurtarieven, btw-tarieven, e.d.)
-- Vervangt localStorage-opslag in apps/everts-calc en wordt server-side gelezen door EVA.

create table if not exists public.bedrijfsinstellingen (
  id           int primary key default 1,
  uurtarieven  jsonb not null default '[]'::jsonb,
  btw_tarieven jsonb not null default '[0,9,21]'::jsonb,
  overige      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  constraint bedrijfsinstellingen_singleton check (id = 1)
);

insert into public.bedrijfsinstellingen (id) values (1)
  on conflict (id) do nothing;

-- updated_at automatisch bijhouden
create or replace function public.bedrijfsinstellingen_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_bedrijfsinstellingen_touch on public.bedrijfsinstellingen;
create trigger trg_bedrijfsinstellingen_touch
  before update on public.bedrijfsinstellingen
  for each row execute function public.bedrijfsinstellingen_touch_updated_at();
