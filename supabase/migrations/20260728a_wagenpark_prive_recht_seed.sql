-- Wagenpark: privé & werktijden — nieuw recht, standaard alleen voor Directie
--
-- Het recht `wagenpark_prive` bepaalt of je privacygevoelige wagenpark-data mag
-- zien: privé-ritten (in Ritten, Bestuurders, Parkeren, Dashboard, Livetracker)
-- én de Werktijden-pagina. Voorheen hing dat aan een hardgecodeerde check
-- (afdeling = 'Directie' OF beheerder); nu loopt `magPriveRittenZien` via dit
-- recht (zie apps/dashboard/src/lib/wagenpark/privacy.ts).
--
-- Alleen Directie krijgt het standaard, zodat de status quo behouden blijft:
-- Directie zag privé-ritten al, Projectbureau (wagenpark = lezen, geen beheer)
-- niet. Een beheerder (instellingen = beheren) passeert de poort sowieso, dus
-- wie de rechten beheert kan zichzelf nooit buitensluiten — geen lockout.
--
-- Idempotent: bestaande rechten blijven staan, alleen deze sleutel wordt gezet.

update public.medewerker_afdelingen
set standaard_rechten =
  coalesce(standaard_rechten, '{}'::jsonb) || jsonb_build_object('wagenpark_prive', 'lezen')
where actief and naam = 'Directie';
