-- Zelfde afscherming als `contactpersonen` en `contactpersoon_organisaties`: lezen mag een
-- ingelogde platformgebruiker, muteren gaat uitsluitend via server actions op de service role.
-- De subquery-vorm `(select is_platform_gebruiker())` is bewust: zo evalueert Postgres de functie
-- één keer per query in plaats van per rij (de initplan-valkuil uit de RLS-hardening).

drop policy if exists contactpersoon_emails_select on public.contactpersoon_emails;
create policy contactpersoon_emails_select
  on public.contactpersoon_emails
  for select
  to authenticated
  using ((select public.is_platform_gebruiker()));
