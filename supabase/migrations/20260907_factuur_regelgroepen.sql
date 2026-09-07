-- Factuurregels samenstellen uit de losse boekingen, in plaats van één regel per bewakingscode.
--
-- Tot nu toe was een factuurregel een afgeleide: alles wat op een bewakingscode geboekt stond werd
-- opgeteld tot één regel, met hooguit een splitsing arbeid/materiaal. Dat is te grof. Wie een
-- regiefactuur opstelt wil de geboekte uren en kosten zien, er prijzen op zetten, posten uitzetten
-- en zelf bepalen wat als één regel bij de klant terechtkomt — met eigen btw per regel.
--
-- Model in drie lagen, van grof naar fijn:
--
--   1. factuur_regelinstellingen  — per bewakingscode: de omschrijving, de standaardopslag en
--      voortaan ook `groepering`: de regel die bepaalt in welke factuurregel een boeking valt
--      zolang er niets handmatigs over is gezegd. Belangrijk voor boekingen die later nog
--      binnenkomen: die volgen dezelfde regel en vallen dus vanzelf op de juiste plek.
--
--   2. factuur_regelgroepen       — één rij = één regel zoals de klant hem op de factuur ziet.
--      Bestaat alleen zodra er iets van afwijkt (eigen tekst, vast bedrag, eigen btw, uitgezet);
--      een groep waar niets over gezegd is wordt volledig uit de boekingen afgeleid.
--
--   3. regie_factuurregels        — per geboekte uur-/kostenregel. Krijgt er `groep_sleutel` bij:
--      de handmatige toewijzing aan een factuurregel. Leeg = volg de groepering van laag 1.
--
-- Sleutels van groepen zijn tekst en betekenisdragend, zodat een groep zonder rij toch bestaat:
--   'alles'                     — de hele bewakingscode op één regel (groepering 'samen')
--   'uur:<uursoort>'            — per soort: alle uren van die uursoort        (groepering 'per_soort')
--   'kost:<kostensoort>'        — per soort: alle kosten van die kostensoort   (groepering 'per_soort')
--   'bron:<type>:<bouw7 id>'    — één boeking op een eigen regel               (groepering 'per_boeking')
--   'hand:<willekeurig>'        — handmatig samengevoegd; staat los van elke regel
--
-- Migratie van wat er al is: `groepering` komt op 'samen' te staan voor elke code die al een rij
-- had. Die dossiers factureren daardoor precies door zoals ze deden — 'per_soort' is de nieuwe
-- standaard, maar mag geen lopende afspraak omgooien. Een vastgezet bedrag verhuist mee naar de
-- groep 'alles', want een bedrag hoort voortaan bij een factuurregel, niet bij een code.

-- ── 1. Groeperingsregel per bewakingscode ────────────────────────────────────────────
alter table public.factuur_regelinstellingen
  add column if not exists groepering text not null default 'per_soort';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'factuur_regelinstellingen_groepering_check'
  ) then
    alter table public.factuur_regelinstellingen
      add constraint factuur_regelinstellingen_groepering_check
      check (groepering in ('per_soort', 'samen', 'per_boeking'));
  end if;
end $$;

comment on column public.factuur_regelinstellingen.groepering is
  'Hoe boekingen zonder handmatige toewijzing tot factuurregels worden gebundeld: per_soort (uursoort/kostensoort), samen (alles op één regel) of per_boeking.';

comment on column public.factuur_regelinstellingen.uitsplitsen is
  'LEGACY — vervangen door groepering. Alleen nog in gebruik als migratiebron; niet meer lezen.';
comment on column public.factuur_regelinstellingen.bedrag_excl_btw is
  'LEGACY — een vast bedrag hoort bij een factuurregel (factuur_regelgroepen.bedrag_excl_btw), niet bij een code. Alleen nog migratiebron.';

-- Bestaande codes hielden alles op één regel, tenzij arbeid/materiaal apart stond. Dat blijft zo.
update public.factuur_regelinstellingen
   set groepering = case when uitsplitsen then 'per_soort' else 'samen' end;

-- ── 2. De factuurregels zelf ─────────────────────────────────────────────────────────
create table if not exists public.factuur_regelgroepen (
  id                    uuid primary key default gen_random_uuid(),
  dossier_id            uuid not null references public.dossiers(id) on delete cascade,
  bewakingscode         text not null,
  groep_sleutel         text not null,
  -- Leeg = tekst afleiden uit de code-omschrijving en het soort werk.
  omschrijving          text,
  -- Vast bedrag voor déze factuurregel; leeg = de som van de gekoppelde boekingen.
  bedrag_excl_btw       numeric(12,2),
  -- Leeg = het btw-tarief van de bewakingscode, en anders dat van de hele factuur.
  btw_tarief_bouw7_id   integer,
  meefactureren         boolean not null default true,
  volgorde              integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (dossier_id, bewakingscode, groep_sleutel)
);

create index if not exists idx_factuur_regelgroepen_dossier
  on public.factuur_regelgroepen(dossier_id);

comment on table public.factuur_regelgroepen is
  'Eén rij = één regel op de verkoopfactuur, samengesteld uit geboekte uren/kosten van één bewakingscode. Bestaat alleen als er iets van de afleiding afwijkt.';

alter table public.factuur_regelgroepen enable row level security;
drop policy if exists factuur_regelgroepen_authenticated on public.factuur_regelgroepen;
create policy factuur_regelgroepen_authenticated
  on public.factuur_regelgroepen
  for all
  to authenticated
  using (true)
  with check (true);

-- ── 3. Handmatige toewijzing van een boeking aan een factuurregel ────────────────────
alter table public.regie_factuurregels
  add column if not exists groep_sleutel text;

comment on column public.regie_factuurregels.groep_sleutel is
  'Handmatige toewijzing aan een factuurregel (factuur_regelgroepen.groep_sleutel). Leeg = volg de groepering van de bewakingscode.';

-- ── 4. Vastgezette bedragen verhuizen naar de groep 'alles' ──────────────────────────
insert into public.factuur_regelgroepen
  (dossier_id, bewakingscode, groep_sleutel, omschrijving, bedrag_excl_btw, btw_tarief_bouw7_id, meefactureren)
select i.dossier_id, i.bewakingscode, 'alles', null, i.bedrag_excl_btw, null, true
  from public.factuur_regelinstellingen i
 where i.bedrag_excl_btw is not null
on conflict (dossier_id, bewakingscode, groep_sleutel) do nothing;
