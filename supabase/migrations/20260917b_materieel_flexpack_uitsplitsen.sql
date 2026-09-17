-- Materieelbeheer — de Flexpack van factuur 384537 uitsplitsen in losse objecten.
--
-- Bij het inlezen stond de pack als één regel in het register omdat de factuur
-- alleen "FLEX FLEXPACK 3 MACHINES + 3 ACCU'S + OPLADER + TAS" met één
-- machinenaam (ODE 2-100 18EC) noemt. Tom heeft op 17 sept 2026 verteld wat
-- erin zat: drie dezelfde machines en drie dezelfde accupacks.
--
-- Eén van de drie machines is inmiddels gestolen en gaat er op zijn verzoek
-- niet in; er blijven dus twee machines over. De € 799 was de prijs van de hele
-- pack, dus die is over de drie machine-eenheden verdeeld (€ 266,33 elk) en de
-- twee resterende dragen samen € 532,66. Het verschil is met de gestolen
-- machine verdwenen, en dat hoort het register ook te laten zien.
--
-- Accupacks en de oplader krijgen geen eigen bedrag: hun waarde zit in de
-- packprijs, net als bij de Flex Powerset op factuur 385714.
--
-- De tas gaat er niet in — zelfde afweging als de losse transporttas op 385714.

with tom as (
  select id from public.medewerkers where voornaam = 'Tom' and achternaam = 'Kamminga' limit 1
), mitchel as (
  select id from public.medewerkers where voornaam = 'Mitchel' and achternaam = 'van Bentem' limit 1
), oud as (
  select id, details from public.materieel_objecten
   where details->>'import_sleutel' = 'FACT-384537-1'
), bron (sleutel, omschrijving, merk, type, aanschafwaarde, opmerkingen, extra) as (
  values
  ('FACT-384537-1a', 'Accu Schuurmachine (delta)', 'Flex', 'ODE 2-100 18-EC', 266.33::numeric,
   'Uit de Flexpack van factuur 384537 (3 machines + 3 accu''s + oplader + tas, samen € 799). Bedrag is de packprijs gedeeld door drie machine-eenheden.'::text,
   '{}'::jsonb),
  ('FACT-384537-1b', 'Accu Schuurmachine (delta)', 'Flex', 'ODE 2-100 18-EC', 266.33::numeric,
   'Uit de Flexpack van factuur 384537 (3 machines + 3 accu''s + oplader + tas, samen € 799). Bedrag is de packprijs gedeeld door drie machine-eenheden.',
   '{}'::jsonb),
  ('FACT-384537-1c', 'Accupack 18V', 'Flex', null, null::numeric,
   'Uit de Flexpack van factuur 384537; waarde zit in de packprijs.', '{}'::jsonb),
  ('FACT-384537-1d', 'Accupack 18V', 'Flex', null, null::numeric,
   'Uit de Flexpack van factuur 384537; waarde zit in de packprijs.', '{}'::jsonb),
  ('FACT-384537-1e', 'Accupack 18V', 'Flex', null, null::numeric,
   'Uit de Flexpack van factuur 384537; waarde zit in de packprijs.', '{}'::jsonb),
  ('FACT-384537-1f', 'Acculader', 'Flex', null, null::numeric,
   'Uit de Flexpack van factuur 384537; waarde zit in de packprijs. Dit is een tweede lader naast de los gefactureerde CA 10.8-18.0.',
   '{}'::jsonb)
), nieuw as (
  insert into public.materieel_objecten (
    omschrijving, categorie, merk, type, aankoopdatum, leverancier, aanschafwaarde,
    status, toewijzing_niveau, toegewezen_medewerker_id, opmerkingen, details, created_by
  )
  select
    b.omschrijving, 'gereedschap'::materieel_categorie, b.merk, b.type,
    date '2026-02-20', 'Redson Regio BV', b.aanschafwaarde,
    'in_gebruik'::materieel_status, 'persoonlijk'::materieel_toewijzing_niveau,
    (select id from mitchel), b.opmerkingen,
    jsonb_build_object(
      'bron', 'Factuuranalyse gereedschap 2026',
      'import_sleutel', b.sleutel,
      'administratie', 'Everts Onderhoudsschilders B.V.',
      'factuur', '384537', 'bon', '196630', 'factuurdatum', '2026-02-24',
      'artikelcode', '521903', 'opgehaald_door', 'Chris',
      'onderdeel_van_set', 'Flex Flexpack: 3 machines + 3 accu''s + oplader + tas',
      -- Twee serienummers voor drie machines: niet te zeggen welk nummer bij welk
      -- exemplaar hoort, dus ze staan hier en niet in de kolom serienummer.
      'serienummers_op_factuur', jsonb_build_array('1024147001767', '1024063012120')),
    (select id from tom)
  from bron b
  where not exists (
    select 1 from public.materieel_objecten o where o.details->>'import_sleutel' = b.sleutel
  )
  returning id
), historie as (
  insert into public.materieel_toewijzingen (object_id, niveau, medewerker_id, van, door, opmerking)
  select n.id, 'persoonlijk'::materieel_toewijzing_niveau, (select id from mitchel),
         date '2026-02-20'::timestamptz, (select id from tom),
         'Houder aangewezen bij het uitsplitsen van de Flexpack'
  from nieuw n
  returning 1
), weg_historie as (
  delete from public.materieel_toewijzingen t using oud o where t.object_id = o.id returning 1
)
delete from public.materieel_objecten o using oud x where o.id = x.id;
