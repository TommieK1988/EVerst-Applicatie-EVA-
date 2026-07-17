-- Materieelbeheer — recht per afdeling (go-live)
--
-- Vanaf nu staat 'materieelbeheer' in AFGEDWONGEN_MODULES: lege rechten betekenen
-- geen toegang. Zonder deze seed zou niemand behalve beheerders
-- (instellingen = beheren) de module nog zien — vandaar deze lockout-preventie,
-- in lijn met 20260616_management_recht_seed.sql.
--
-- Niveaus, afgesproken met de opdrachtgever:
--   beheren    → Directie, Projectbureau: aankoop, keuringen, teams en
--                instellingen beheren, documenten verwijderen, archiveren.
--   schrijven  → Uitvoering, Ondersteunend: dagelijks gebruik — scannen, de
--                periodieke controle invullen, toewijzen, storing melden,
--                materieel toevoegen, bestanden uploaden. Bewust géén
--                verwijderen/archiveren: monteurs horen geen facturen of
--                keuringsdocumenten te kunnen wissen.
--
-- Idempotent: bestaande rechten blijven staan, alleen de materieelbeheer-sleutel
-- wordt gezet/overschreven.

update public.medewerker_afdelingen
set standaard_rechten =
  coalesce(standaard_rechten, '{}'::jsonb) || jsonb_build_object('materieelbeheer', 'beheren')
where actief and naam in ('Directie', 'Projectbureau');

update public.medewerker_afdelingen
set standaard_rechten =
  coalesce(standaard_rechten, '{}'::jsonb) || jsonb_build_object('materieelbeheer', 'schrijven')
where actief and naam in ('Uitvoering', 'Ondersteunend');
