-- RLS-gat gedicht: contactpersonen + contactpersoon_organisaties hadden RLS aan
-- maar geen enkele policy. Daardoor kon de sessie-client (die RLS respecteert) er
-- niets uit lezen. De offerte-render draait op de sessie-client, dus de embed
-- `contactpersonen!contactpersoon_id` in offerte-bronnen.ts leverde null op en de
-- {contactpersoon.*}-variabelen bleven leeg — terwijl het dossierscherm (admin-
-- client, RLS-bypass) de contactpersoon wél toonde.
--
-- Zelfde vorm als relaties_select: platformgebruikers mogen lezen. Schrijven op
-- contactpersonen blijft via de admin-client, dus alleen SELECT is nodig.

drop policy if exists contactpersonen_select on public.contactpersonen;
create policy contactpersonen_select on public.contactpersonen
  for select to authenticated using (is_platform_gebruiker());

drop policy if exists contactpersoon_organisaties_select on public.contactpersoon_organisaties;
create policy contactpersoon_organisaties_select on public.contactpersoon_organisaties
  for select to authenticated using (is_platform_gebruiker());
