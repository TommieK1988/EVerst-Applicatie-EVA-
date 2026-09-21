-- Draait `20260921i_quote_terms_offerteteksten.sql` terug.
--
-- Die migratie voegde de tekstsoort `offerteteksten` toe voor één samengevoegd tekstblok
-- op de offerte. Diezelfde dag is het ontwerp vereenvoudigd: er is nog maar één veld — de
-- inleidende tekst — en die staat als opgemaakte HTML op `quotes.inleiding`, niet in
-- `quote_terms`. De extra soort is daarmee dode schema-ruimte.
--
-- Er is nooit een rij van die soort in productie geschreven; de veiligheidscheck hieronder
-- bevestigt dat vóór de constraint wordt teruggezet, zodat dit nooit stilzwijgend data
-- ongeldig maakt.

do $$
declare
  aantal int;
begin
  select count(*) into aantal from public.quote_terms where type = 'offerteteksten';
  if aantal > 0 then
    raise exception 'Er staan % rijen met type=offerteteksten; eerst verplaatsen naar quotes.inleiding.', aantal;
  end if;
end $$;

alter table public.quote_terms drop constraint if exists quote_terms_type_check;

alter table public.quote_terms add constraint quote_terms_type_check
  check (type = any (array[
    'voorwaarden'::text,
    'uitsluitingen'::text,
    'opmerkingen'::text
  ]));

comment on column public.quote_terms.type is
  'De drie losse tekstsoorten van vóór september 2026. Worden niet meer geschreven en niet meer in de offerte gerenderd; de offertetekst staat nu als opgemaakte HTML op quotes.inleiding.';
