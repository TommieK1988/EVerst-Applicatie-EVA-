-- Reserveert het volgende offertenummer (OFT-YYYY-NNN) uit dezelfde sequence als
-- de set_quote_nummer-trigger, zonder een offerte aan te maken. Zo krijgt een
-- calculatie al bij aanmaken een nummer, dat de offerte later overneemt.
create or replace function public.reserveer_offerte_nummer()
returns text
language sql
volatile
as $$
  select 'OFT-' || to_char(now(), 'YYYY') || '-'
    || lpad(nextval('quote_volgnummer')::text, 3, '0');
$$;
