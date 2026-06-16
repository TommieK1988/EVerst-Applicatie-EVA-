-- Seed: Management-recht per afdeling (lockout-preventie)
--
-- Vanaf nu wordt het Management-tab afgedwongen op basis van `standaard_rechten.management`.
-- Lege rechten betekenen "geen toegang"; zonder seed zou Management voor iedereen verdwijnen.
-- Daarom: voor elke actieve afdeling die nog geen management-recht heeft, een zinnige default:
--   - afdelingen die al 'instellingen' = 'beheren' hebben (beheerders) → 'beheren'
--   - alle overige actieve afdelingen → 'lezen' (tab + dashboard zichtbaar)
-- Beheerders kunnen dit daarna per afdeling aanscherpen via Instellingen → Gebruikers & rechten.

update public.medewerker_afdelingen
set standaard_rechten = coalesce(standaard_rechten, '{}'::jsonb) || jsonb_build_object(
  'management',
  case when standaard_rechten->>'instellingen' = 'beheren' then 'beheren' else 'lezen' end
)
where actief = true
  and not (coalesce(standaard_rechten, '{}'::jsonb) ? 'management');
