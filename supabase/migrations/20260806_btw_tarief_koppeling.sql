-- BTW-tarieven: van los percentage naar een verwijzing naar het tarief zelf.
--
-- Aanleiding: de calculatie bood maar drie keuzes (0/9/21) omdat die lijst uit een
-- losse `number[]` in de calc-instellingen kwam, terwijl `btw_tarieven` (afgeleid uit
-- Bouw7) zes tarieven kent. Een percentage alleen is bovendien niet genoeg: "Verlegd
-- Hoog 21%" en "Hoog 21%" hebben hetzelfde percentage maar een ander gevolg — bij
-- verlegd wordt er 0% geheven.
--
-- Afspraak vanaf nu: `btw_pct` blijft het **te heffen** percentage (verlegd ⇒ 0), zodat
-- alle bestaande berekeningen ongewijzigd kloppen. `btw_tarief_id` draagt de identiteit
-- van het tarief (label, verlegd-vlag, Bouw7-id) voor weergave en terugschrijven.

alter table public.quote_lines
  add column if not exists btw_tarief_id uuid references public.btw_tarieven(id) on delete set null;

alter table public.quotes
  add column if not exists btw_tarief_id uuid references public.btw_tarieven(id) on delete set null;

alter table public.werkbegroting_regels
  add column if not exists btw_tarief_id uuid references public.btw_tarieven(id) on delete set null;

create index if not exists quote_lines_btw_tarief_id_idx on public.quote_lines (btw_tarief_id);
create index if not exists werkbegroting_regels_btw_tarief_id_idx on public.werkbegroting_regels (btw_tarief_id);

comment on column public.quote_lines.btw_tarief_id is
  'Gekozen BTW-tarief (btw_tarieven). btw_pct blijft het te heffen percentage; bij een verlegd tarief is dat 0.';
comment on column public.quotes.btw_tarief_id is
  'Terugvaltarief voor regels zonder eigen tarief.';
comment on column public.werkbegroting_regels.btw_tarief_id is
  'Gekozen BTW-tarief (btw_tarieven), overgenomen uit de calculatieregel.';

-- Backfill: bestaande regels wijzen naar het niet-verlegde tarief met hetzelfde
-- percentage. Verlegde tarieven slaan we bewust over — die waren tot nu toe niet
-- kiesbaar, dus een 0%-regel uit het verleden is "Geen", geen verlegging.
with keuze as (
  select distinct on (percentage) id, percentage
  from public.btw_tarieven
  where actief and not verlegd
  order by percentage, created_at
)
update public.quote_lines l
set btw_tarief_id = k.id
from keuze k
where l.btw_tarief_id is null
  and l.btw_pct is not null
  and k.percentage = l.btw_pct;

with keuze as (
  select distinct on (percentage) id, percentage
  from public.btw_tarieven
  where actief and not verlegd
  order by percentage, created_at
)
update public.werkbegroting_regels r
set btw_tarief_id = k.id
from keuze k
where r.btw_tarief_id is null
  and r.btw_pct is not null
  and k.percentage = r.btw_pct;

-- De oude handmatige percentagelijsten zijn vervallen; `btw_tarieven` is de enige bron.
-- De kolom blijft staan (historie), maar wordt door de applicatie niet meer gelezen.
comment on column public.bedrijfsinstellingen.btw_tarieven is
  'VERVALLEN (aug 2026): gebruik de tabel btw_tarieven. Wordt niet meer gelezen of geschreven.';
