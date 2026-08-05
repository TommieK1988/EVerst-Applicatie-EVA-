-- Versturen naar leverancier als aparte stap.
--
-- Tot nu toe deed "Aanmaken in Bouw7" alles in één klik: contract (concept) → status → leverbon.
-- Nu wordt dat opgeknipt: aanmaken zet alleen het concept; een aparte stap "Versturen naar
-- leverancier" mailt de order (EVA-PDF via Outlook) en roept dán pas af (status uit concept +
-- leverbon per regel). Deze kolommen leggen dat verzendmoment vast — los van bouw7_afroep_op
-- (leverbon) en verzonden_op (dat historisch het aanmaken van het concept markeerde).

alter table public.werkbegroting_bestellingen
  add column if not exists verstuurd_op    timestamptz,
  add column if not exists verstuurd_door  uuid references public.medewerkers(id),
  add column if not exists verstuurd_naar   text;

comment on column public.werkbegroting_bestellingen.verstuurd_op is
  'Moment waarop de order/het contract naar de leverancier is gemaild (EVA-Outlook). Null = nog niet verstuurd; dit maakt de bestelling onwijzigbaar.';
comment on column public.werkbegroting_bestellingen.verstuurd_door is
  'Medewerker die de order heeft verstuurd.';
comment on column public.werkbegroting_bestellingen.verstuurd_naar is
  'E-mailadres(sen) waarnaar de order is gemaild.';
