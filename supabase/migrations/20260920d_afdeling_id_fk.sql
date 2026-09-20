-- De koppeling medewerker → afdeling was een string-match op naam:
-- `medewerkers.afdeling (text)` tegen `medewerker_afdelingen.naam`. Hernoem je een
-- afdeling, dan matcht niets meer en verliest iedereen in die afdeling stil zijn
-- standaardrechten — zonder foutmelding, zonder spoor. Dit vervangt de match door
-- een echte verwijzing.
--
-- `medewerkers.afdeling` blijft bestaan als spiegel. Acht plekken lezen de afdeling
-- nog op naam (lib/uren/goedkeuring.ts, verlof-pool.ts, debiteuren/actions.ts,
-- wagenpark/{notificaties,compliance-kern}.ts, instellingen/uren, taken/sjablonen);
-- die blijven werken doordat 20260920e de naam bij een hernoeming meeschrijft.
-- Alleen het RECHTENPAD gaat over de nieuwe FK.

-- Voorwaarde voor een betrouwbare backfill én voor de propagatie-trigger hierna:
-- twee afdelingen met dezelfde naam maken beide onbeslisbaar.
create unique index if not exists medewerker_afdelingen_naam_uniek
  on public.medewerker_afdelingen (lower(naam));

alter table public.medewerkers
  add column if not exists afdeling_id uuid references public.medewerker_afdelingen(id);

comment on column public.medewerkers.afdeling_id is
  'Afdeling van de medewerker. Leidend voor de standaardrechten; de tekstkolom '
  '`afdeling` is de spiegel die door trg_afdeling_naam_propageer bijgehouden wordt.';

-- Er wordt op gejoind (getEffectieveRechten doet dit bij elke request).
create index if not exists medewerkers_afdeling_id_idx
  on public.medewerkers (afdeling_id);

-- Backfill uit de bestaande tekstkolom. Alle vier de actieve afdelingen hebben
-- vandaag een unieke naam, dus dit dekt iedereen met een ingevulde afdeling.
update public.medewerkers m
   set afdeling_id = a.id
  from public.medewerker_afdelingen a
 where lower(a.naam) = lower(m.afdeling)
   and m.afdeling_id is null;
