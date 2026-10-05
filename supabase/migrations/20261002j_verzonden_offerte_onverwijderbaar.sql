-- Deel 3 van 20261002h_archiveren_offerte_stamdata (zie daar de aanleiding).

-- 4. Een verzonden offerte is een juridisch document: nooit verwijderen.
--    Alleen concepten mogen weg (die worden bij opnieuw aanmaken vervangen).
create or replace function public.quotes_alleen_concept_verwijderen()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from 'concept' then
    raise exception 'Offerte % is al verzonden en kan niet verwijderd worden.', coalesce(old.quote_nummer, old.id::text)
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists quotes_alleen_concept_verwijderen on public.quotes;
create trigger quotes_alleen_concept_verwijderen
  before delete on public.quotes
  for each row execute function public.quotes_alleen_concept_verwijderen();

