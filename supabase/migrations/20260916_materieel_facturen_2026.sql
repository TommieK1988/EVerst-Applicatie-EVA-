-- Materieelbeheer — gereedschap uit de inkoopfacturen van 2026 bijboeken.
--
-- Bron: 13 inkoopfacturen (Redson Regio BV + Claasen Coatings B.V.) over de
-- administraties Everts Onderhoudsschilders B.V. en Bouwbedrijf Morgenstond B.V.,
-- afgestemd op grootboekrekening 4230 "Kleine aanschaffingen / gereedschap".
--
-- Verbruik (tape, kabelbundelbandjes, houtrotfrezen, steunschijf, rolbandmaat,
-- ketting, losse onderdelen) gaat er bewust NIET in — zelfde afspraak als bij de
-- factuuranalyse over 2025.
--
-- Idempotent: elke rij draagt details.import_sleutel; opnieuw draaien voegt niets
-- toe. Terugdraaien kan met
--   delete from public.materieel_objecten where details->>'bron' = 'Factuuranalyse gereedschap 2026';

with tom as (
  select id from public.medewerkers where voornaam = 'Tom' and achternaam = 'Kamminga' limit 1
), bron (
  sleutel, omschrijving, categorie, merk, type, serienummer, aankoopdatum,
  leverancier, aanschafwaarde, medewerker_id, opmerkingen, extra
) as (
  values
  -- ── Everts Onderhoudsschilders B.V. — Redson Regio BV ──────────────────
  ('FACT-384537-1', 'Flexpack — 3 machines + 3 accu''s + oplader + tas', 'machine', 'Flex', 'FLEXPACK (o.a. ODE 2-100 18-EC)', '1024147001767'::text, date '2026-02-20',
   'Redson Regio BV', 799.00::numeric, null::uuid,
   'Pakket: 3 machines + 3 accu''s + oplader + tas. Op de factuur is alleen de ODE 2-100 18-EC met naam genoemd. Nog uitsplitsen in losse objecten zodra het pakket fysiek is nagelopen.'::text,
   jsonb_build_object('factuur','384537','bon','196630','factuurdatum','2026-02-24','artikelcode','521903','opgehaald_door','Chris','serienummers', jsonb_build_array('1024147001767','1024063012120'))),

  ('FACT-384537-2', 'Acculader', 'gereedschap', 'Flex', 'CA 10.8-18.0', null, date '2026-02-20',
   'Redson Regio BV', 50.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','384537','bon','196630','factuurdatum','2026-02-24','artikelcode','521836','opgehaald_door','Chris')),

  ('FACT-385714-1', 'Accu Vlakschuurmachine', 'gereedschap', 'Flex', 'OSE 2-80 18-EC', '532084', date '2026-03-10',
   'Redson Regio BV', 204.86::numeric, (select id from public.medewerkers where voornaam='Danny' and achternaam='Hermeling'), null,
   jsonb_build_object('factuur','385714','bon','197228','factuurdatum','2026-03-17','artikelcode','521819','opgehaald_door','Danny')),

  ('FACT-385714-2', 'Acculader (snellader)', 'gereedschap', 'Flex', null, '1125199003546', date '2026-03-10',
   'Redson Regio BV', 166.66::numeric, (select id from public.medewerkers where voornaam='Danny' and achternaam='Hermeling'),
   'Onderdeel van de Flex Powerset (2 accu''s 5,0 Ah + snellader); de 166,66 is de prijs van de hele set.',
   jsonb_build_object('factuur','385714','bon','197228','factuurdatum','2026-03-17','artikelcode','521829','opgehaald_door','Danny','set','Flex Powerset + snellader, 2x accu 5,0 Ah','prijs_is_setprijs',true)),

  ('FACT-385714-3', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Flex', null, null, date '2026-03-10',
   'Redson Regio BV', null::numeric, (select id from public.medewerkers where voornaam='Danny' and achternaam='Hermeling'), null,
   jsonb_build_object('factuur','385714','bon','197228','factuurdatum','2026-03-17','opgehaald_door','Danny','onderdeel_van_set','Flex Powerset + snellader, 2x accu 5,0 Ah')),

  ('FACT-385714-4', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Flex', null, null, date '2026-03-10',
   'Redson Regio BV', null::numeric, (select id from public.medewerkers where voornaam='Danny' and achternaam='Hermeling'), null,
   jsonb_build_object('factuur','385714','bon','197228','factuurdatum','2026-03-17','opgehaald_door','Danny','onderdeel_van_set','Flex Powerset + snellader, 2x accu 5,0 Ah')),

  ('FACT-385715-1', 'Accu Rechte Slijper', 'gereedschap', 'Flex', 'DGE 25 18.0-EC', null, date '2026-03-11',
   'Redson Regio BV', 245.65::numeric, null::uuid, 'Losse body in doos — zonder accu en lader.',
   jsonb_build_object('factuur','385715','bon','197309','factuurdatum','2026-03-17','artikelcode','520000','opgehaald_door','Chris')),

  ('FACT-386056-1', 'Accu Schroef-/Boormachine', 'gereedschap', 'Flex', 'DD 2G 18.0-EC LD/2.5', null, date '2026-03-17',
   'Redson Regio BV', 213.00::numeric, (select id from public.medewerkers where voornaam='Mitchel' and achternaam='van Bentem'),
   'SET-uitvoering; op de factuur staat niet welke accu''s en lader erbij zaten.',
   jsonb_build_object('factuur','386056','bon','197500','factuurdatum','2026-03-24','artikelcode','521744','opgehaald_door','Mitchel van Bentem')),

  ('FACT-387209-1', 'Accu Blazer', 'gereedschap', 'Makita', 'DUB186Z', null, date '2026-04-07',
   'Redson Regio BV', 65.00::numeric, (select id from public.medewerkers where voornaam='Jasper' and achternaam='Middelburg'),
   'Zonder accu''s en lader, in doos.',
   jsonb_build_object('factuur','387209','bon','198296','factuurdatum','2026-04-14','artikelcode','560186','opgehaald_door','Jasper','referentie','429391K')),

  ('FACT-388623-1', 'Accu Schroef-/Boormachine', 'gereedschap', 'Flex', 'DD 2G 18.0-EC LD/2.5', null, date '2026-05-04',
   'Redson Regio BV', 180.00::numeric, null::uuid,
   'SET-uitvoering; op de factuur staat niet welke accu''s en lader erbij zaten.',
   jsonb_build_object('factuur','388623','bon','266688','factuurdatum','2026-05-12','artikelcode','521744','besteld_door','Rob')),

  -- ── Everts Onderhoudsschilders B.V. — Claasen Coatings B.V. ────────────
  ('FACT-F2294394-1', 'Accu Schuurmachine (delta)', 'gereedschap', 'Flex', 'ODE 2-100 18-EC/2.5', '1024214145158', date '2026-04-30',
   'Claasen Coatings B.V.', 239.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','F2294394','factuurdatum','2026-05-22','artikelnummer','739010532089','levernummer','V2303953','referentie','John')),

  ('FACT-F2294394-2', 'Accu Schuurmachine (delta)', 'gereedschap', 'Flex', 'ODE 2-100 18-EC/2.5', '1024214144465', date '2026-04-30',
   'Claasen Coatings B.V.', 239.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','F2294394','factuurdatum','2026-05-22','artikelnummer','739010532089','levernummer','V2303953','referentie','John')),

  ('FACT-F2294394-3', 'Accu Schuurmachine (delta)', 'gereedschap', 'Flex', 'ODE 2-100 18-EC/2.5', '1024214143581', date '2026-04-30',
   'Claasen Coatings B.V.', 239.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','F2294394','factuurdatum','2026-05-22','artikelnummer','739010532089','levernummer','V2303953','referentie','John')),

  ('FACT-F2301989-1', 'Dubbel oploopbare trap 2 x 4 treden', 'ladder', 'Altrex', 'Falco FDO 2 x 4', null, date '2026-07-09',
   'Claasen Coatings B.V.', 287.00::numeric, null::uuid, 'Dubbel oploopbaar.',
   jsonb_build_object('factuur','F2301989','factuurdatum','2026-07-10','artikelnummer','400000192424','levernummer','V2315484','referentie','Mark','werk','20261-00320','sporten',4)),

  -- ── Bouwbedrijf Morgenstond B.V. — Redson Regio BV ─────────────────────
  ('FACT-382439-1', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-08',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382439','bon','264421','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Tom Kamminga')),

  ('FACT-382439-2', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-08',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382439','bon','264421','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Tom Kamminga')),

  ('FACT-382441-1', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-06',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382441','bon','027458','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Ap van der Pluijm')),

  ('FACT-382441-2', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-06',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382441','bon','027458','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Ap van der Pluijm')),

  ('FACT-382441-3', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-06',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382441','bon','027458','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Ap van der Pluijm')),

  ('FACT-382441-4', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-06',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382441','bon','027458','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Ap van der Pluijm')),

  ('FACT-382441-5', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-06',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382441','bon','027458','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Ap van der Pluijm')),

  ('FACT-382441-6', 'Accupack 18V 5,0 Ah', 'gereedschap', 'Makita', 'BL1850B', null, date '2026-01-06',
   'Redson Regio BV', 65.00::numeric, null::uuid, null,
   jsonb_build_object('factuur','382441','bon','027458','factuurdatum','2026-01-13','artikelcode','585062','besteld_door','Ap van der Pluijm')),

  ('FACT-382441-7', 'Accu Lijm- en Kitspuit', 'gereedschap', 'Makita', 'DCG180Z', null, date '2026-01-06',
   'Redson Regio BV', 153.55::numeric, null::uuid, 'Zonder accu''s en lader, in doos.',
   jsonb_build_object('factuur','382441','bon','027458','factuurdatum','2026-01-13','artikelcode','560175','besteld_door','Ap van der Pluijm','referentie','748991E')),

  ('FACT-384706-1', 'Accu Tacker (brad nailer 16Ga)', 'gereedschap', 'Makita', 'DBN610ZJ', null, date '2026-02-20',
   'Redson Regio BV', 405.90::numeric, (select id from public.medewerkers where voornaam='Marinus' and achternaam='van Kooten'),
   'Zonder accu''s en lader, in MBox. Nagels 16Ga, 1,6 x 32-64 mm.',
   jsonb_build_object('factuur','384706','bon','196633','factuurdatum','2026-02-24','artikelcode','561601','opgehaald_door','Rien','referentie','11171E')),

  ('FACT-385844-1', 'Accu Afkort-/Verstekzaagmachine 165 mm', 'machine', 'Makita', 'DLS600Z', null, date '2026-03-12',
   'Redson Regio BV', 515.76::numeric, (select id from public.medewerkers where voornaam='Danny' and achternaam='Hermeling'), null,
   jsonb_build_object('factuur','385844','bon','197322','factuurdatum','2026-03-17','artikelcode','561019','opgehaald_door','Danny','referentie','37508E'))
), nieuw as (
  insert into public.materieel_objecten (
    omschrijving, categorie, merk, type, serienummer, aankoopdatum, leverancier,
    aanschafwaarde, status, toewijzing_niveau, toegewezen_medewerker_id,
    opmerkingen, details, created_by
  )
  select
    b.omschrijving, b.categorie::materieel_categorie, b.merk, b.type, b.serienummer,
    b.aankoopdatum, b.leverancier, b.aanschafwaarde,
    (case when b.medewerker_id is null then 'beschikbaar' else 'in_gebruik' end)::materieel_status,
    (case when b.medewerker_id is null then 'algemeen' else 'persoonlijk' end)::materieel_toewijzing_niveau,
    b.medewerker_id, b.opmerkingen,
    b.extra || jsonb_build_object(
      'bron', 'Factuuranalyse gereedschap 2026',
      'import_sleutel', b.sleutel,
      'administratie', case
        when b.sleutel like 'FACT-382%' or b.sleutel like 'FACT-384706%' or b.sleutel like 'FACT-385844%'
        then 'Bouwbedrijf Morgenstond B.V.' else 'Everts Onderhoudsschilders B.V.' end),
    (select id from tom)
  from bron b
  where not exists (
    select 1 from public.materieel_objecten o
    where o.details->>'import_sleutel' = b.sleutel
  )
  returning id, toegewezen_medewerker_id, aankoopdatum, details
)
insert into public.materieel_toewijzingen (object_id, niveau, medewerker_id, van, door, opmerking)
select
  n.id, 'persoonlijk'::materieel_toewijzing_niveau, n.toegewezen_medewerker_id,
  n.aankoopdatum::timestamptz, (select id from tom),
  'Toegewezen bij factuurimport 2026 (' || coalesce(n.details->>'opgehaald_door', n.details->>'besteld_door')
    || ' op factuur ' || (n.details->>'factuur') || ')'
from nieuw n
where n.toegewezen_medewerker_id is not null;
