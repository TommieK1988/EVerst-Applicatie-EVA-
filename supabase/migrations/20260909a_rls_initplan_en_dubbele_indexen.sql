-- RLS: auth.uid() eenmalig evalueren in plaats van per rij, en twee dubbele indexen weg.
--
-- WAAROM (RLS): `auth.uid()` en `is_platform_gebruiker()` zijn allebei STABLE, maar zonder
-- subquery roept Postgres ze voor ELKE RIJ opnieuw aan. Bij duizend rijen is dat duizend
-- aanroepen. Verpak je ze in `(select ...)`, dan maakt de planner er een InitPlan van: één
-- keer per statement. Zelfde uitkomst, dezelfde rechten -- alleen fors minder werk.
--
-- Dat weegt hier extra zwaar bij `medewerkers_select`: `is_platform_gebruiker()` doet zelf
-- een `select` op `medewerkers`. Per rij uitgevoerd is dat een query binnen een query.
--
-- WAAROM (indexen): `dossier_bestanden` had twee paar identieke indexen. Een index kost bij
-- elke insert en update onderhoud, dus een exacte kopie is puur schrijfwerk zonder baat.
-- Beide gedropte indexen zijn woordelijk gelijk aan de behouden versie en dragen geen
-- constraint; er verandert niets aan wat de planner kan gebruiken.
--
-- AANLEIDING: de storing van 9 september 2026. De database draaide op de kleinste instance
-- en had geen marge. De instance is opgeschaald; dit haalt daarnaast structureel werk weg
-- bij elke query die door RLS gaat.
--
-- De 17 policies zijn woordelijk overgenomen uit `pg_policies` -- rol, commando en conditie
-- zijn ongewijzigd, alleen de functie-aanroepen zijn verpakt.

-- === Eigen-rij policies (authenticated) ======================================

drop policy if exists eigen_changelog_gezien on public.changelog_gezien;
create policy eigen_changelog_gezien on public.changelog_gezien
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists eigen_concepten on public.formulier_concepten;
create policy eigen_concepten on public.formulier_concepten
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists eigen_notificaties on public.notificaties;
create policy eigen_notificaties on public.notificaties
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Eigen comments wijzigen" on public.task_comments;
create policy "Eigen comments wijzigen" on public.task_comments
  for update to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Eigen comments verwijderen" on public.task_comments;
create policy "Eigen comments verwijderen" on public.task_comments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- === Medewerkers: eigen rij of platformgebruiker ==============================

drop policy if exists medewerkers_select on public.medewerkers;
create policy medewerkers_select on public.medewerkers
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (select public.is_platform_gebruiker())
  );

-- === Goedkeuringen: lezen voor iedereen die is ingelogd =======================

drop policy if exists "Lezen voor ingelogde gebruikers" on public.goedkeuringen;
create policy "Lezen voor ingelogde gebruikers" on public.goedkeuringen
  for select
  using ((select auth.uid()) is not null);

drop policy if exists "Lezen voor ingelogde gebruikers" on public.goedkeuring_opmerkingen;
create policy "Lezen voor ingelogde gebruikers" on public.goedkeuring_opmerkingen
  for select
  using ((select auth.uid()) is not null);

drop policy if exists "Lezen voor ingelogde gebruikers" on public.goedkeuring_gebeurtenissen;
create policy "Lezen voor ingelogde gebruikers" on public.goedkeuring_gebeurtenissen
  for select
  using ((select auth.uid()) is not null);

drop policy if exists "Lezen voor ingelogde gebruikers" on public.werkbegroting_goedkeuring_regels;
create policy "Lezen voor ingelogde gebruikers" on public.werkbegroting_goedkeuring_regels
  for select
  using ((select auth.uid()) is not null);

-- === Werkbegroting =============================================================

drop policy if exists "Toegang via project" on public.werkbegrotingen;
create policy "Toegang via project" on public.werkbegrotingen
  for all
  using ((select auth.uid()) is not null);

drop policy if exists "Toegang via werkbegroting" on public.werkbegroting_regels;
create policy "Toegang via werkbegroting" on public.werkbegroting_regels
  for all
  using ((select auth.uid()) is not null);

drop policy if exists "Toegang via werkbegroting_regel" on public.werkbegroting_componenten;
create policy "Toegang via werkbegroting_regel" on public.werkbegroting_componenten
  for all
  using ((select auth.uid()) is not null);

drop policy if exists "Toegang via werkbegroting" on public.werkbegroting_bestellingen;
create policy "Toegang via werkbegroting" on public.werkbegroting_bestellingen
  for all
  using ((select auth.uid()) is not null);

drop policy if exists "Toegang via bestelling" on public.werkbegroting_bestelling_regels;
create policy "Toegang via bestelling" on public.werkbegroting_bestelling_regels
  for all
  using ((select auth.uid()) is not null);

drop policy if exists "Inzien eigen wijzigingen" on public.werkbegroting_wijzigingen;
create policy "Inzien eigen wijzigingen" on public.werkbegroting_wijzigingen
  for select
  using ((select auth.uid()) is not null);

drop policy if exists "Toevoegen wijzigingen" on public.werkbegroting_wijzigingen;
create policy "Toevoegen wijzigingen" on public.werkbegroting_wijzigingen
  for insert
  with check ((select auth.uid()) is not null);

-- === Dubbele indexen ===========================================================
-- Behouden: dossier_bestanden_bron_idx en dossier_bestanden_dossier_idx.

drop index if exists public.idx_dossier_bestanden_bron;
drop index if exists public.idx_dossier_bestanden_dossier;
