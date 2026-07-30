-- Vervangt 20260730g: zelfde import, met drie gecorrigeerde rekenpunten (zie hieronder),
-- HR-C4-025S verwijderd en 'toeslag zwaar profiel' toegevoegd als regel zonder prijs.

-- Houtrotrecepten + materialen uit "Prijslijst houtschade 2025.xls".
-- Opbouw:  verkoop = (tijdnorm / 60 x uurtarief + materiaal) x 1,38   (AK 25% + W&R 13%)
-- Arbeid hangt aan uursoort "Arbeid timmerman" (EUR 48,00); de prijslijst rekende zelf met EUR 45,00.
-- Materiaal: epoxy (DRY FLEX 4) en fix (DRY FIX UNI) apart, kozijnhout apart, overige
-- verbruiksartikelen samengevoegd in één post "Klein materiaal".
--
-- Drie correcties op het Excel-bestand:
--  1. Geen dubbele uurtoeslag. Bij P4/50, /100 en /200 zit de 30% al in de tijdsom van het
--     detailblad (SUM(...)*1,3); daar telt het tabblad Totaal hem niet nog eens bij.
--  2. P4/50 mist in het Excel de freeskosten (somformule slaat een regel over); die tellen mee.
--  3. Materiaalverlies uit de detailbladen (10%, bij P5 en C1/10-15 20%) is in de
--     materiaalhoeveelheden verwerkt; het Excel liet dat buiten de prijs.

-- 1. Materiaalbibliotheek
update public.evc_materialen set omschrijving = 'Repair Care DRY FLEX® 4', merk = 'Repair Care', materiaalgroep = 'Plamuur & kit', eenheid = 'ml', kostprijs = 0.15, aangepast_op = now() where omschrijving in ('DRY FLEX® 4', 'Repair Care DRY FLEX® 4');
update public.evc_materialen set omschrijving = 'Repair Care DRY FIX® UNI', merk = 'Repair Care', materiaalgroep = 'Plamuur & kit', eenheid = 'ml', kostprijs = 0.173333, aangepast_op = now() where omschrijving in ('DRY FIX® UNI', 'Repair Care DRY FIX® UNI');
insert into public.evc_materialen (omschrijving, merk, materiaalgroep, eenheid, kostprijs, status, bron)
select v.om, v.merk, v.groep, v.eh, v.prijs, 'actief', 'handmatig'
from (values
  ('Repair Care DRY FLEX® 4', 'Repair Care', 'Plamuur & kit', 'ml', 0.15::numeric),
  ('Repair Care DRY FIX® UNI', 'Repair Care', 'Plamuur & kit', 'ml', 0.173333::numeric),
  ('Repair Care DRY FLEX® SF', 'Repair Care', 'Plamuur & kit', 'ml', 0.222222::numeric),
  ('Repair Care DRY SEAL MP', 'Repair Care', 'Plamuur & kit', 'ml', 0.068966::numeric),
  ('Zaagblad', null, 'Gereedschap & PBM', 'st', 15::numeric),
  ('Bolkopfrees', null, 'Gereedschap & PBM', 'st', 18::numeric),
  ('Schuurpapier', null, 'Gereedschap & PBM', 'st', 2.5::numeric),
  ('Kozijnhout', null, 'Hout & plaatmateriaal', 'm1', 40::numeric)
) as v(om, merk, groep, eh, prijs)
where not exists (select 1 from public.evc_materialen b where b.omschrijving = v.om);

-- 2. Proefrecept "P2" opzij (dubbel met HR-P2) en eerdere import weghalen
update public.paint_items set active = false where item_code = 'P2' and onderdeel = 'Houtrot';
delete from public.paint_labor_norms    where item_id in (select id from public.paint_items where item_code like 'HR-%');
delete from public.paint_material_norms where item_id in (select id from public.paint_items where item_code like 'HR-%');
delete from public.paint_items where item_code like 'HR-%';

-- 3. Recepten (38) met arbeids- en materiaalnormen
with r(code, naam, descr, eenheid, groep, btw, uren, tijd, met_arbeid) as (values
  ('HR-P2', 'Afdichten van verbindingen – buitenzijde', 'Afmeting 12 x 1 x 1.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Verbindingen afdichten', 'laag', 0.423583::numeric, 'Tijdnorm 19,55 min + 30% standaard uurtoeslag = 25,41 min.', true),
  ('HR-P3', 'Afdichten van verbindingen – neut', 'Afmeting 12 x 1 x 1.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Verbindingen afdichten', 'laag', 0.442217::numeric, 'Tijdnorm 20,41 min + 30% standaard uurtoeslag = 26,53 min.', true),
  ('HR-P10', 'Afdichten van verbindingen – binnenzijde', 'Afmeting 12 x 1 x 1.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Verbindingen afdichten', 'laag', 0.430733::numeric, 'Tijdnorm 19,88 min + 30% standaard uurtoeslag = 25,84 min.', true),
  ('HR-P5', 'Herstellen van noesten / kwasten', 'Afmeting 2 x 2 cm.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 20% verlies.', 'st', 'Noesten en kwasten', 'laag', 0.347317::numeric, 'Tijdnorm 16,03 min + 30% standaard uurtoeslag = 20,84 min.', true),
  ('HR-P4-025', 'Herstellen van scheuren – 25 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Scheuren herstellen', 'laag', 0.477273::numeric, 'Tijdnorm 22,03 min + 30% standaard uurtoeslag = 28,64 min.', true),
  ('HR-P4-050', 'Herstellen van scheuren – 50 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Scheuren herstellen', 'laag', 0.563983::numeric, 'Tijdnorm 33,84 min, inclusief de 30% standaard uurtoeslag die het prijsblad hier al had verwerkt.', true),
  ('HR-P4-100', 'Herstellen van scheuren – 100 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Scheuren herstellen', 'laag', 0.723667::numeric, 'Tijdnorm 43,42 min, inclusief de 30% standaard uurtoeslag die het prijsblad hier al had verwerkt.', true),
  ('HR-P4-200', 'Herstellen van scheuren – 200 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Scheuren herstellen', 'laag', 0.9737::numeric, 'Tijdnorm 58,42 min, inclusief de 30% standaard uurtoeslag die het prijsblad hier al had verwerkt.', true),
  ('HR-P4-300', 'Herstellen van scheuren – 300 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Scheuren herstellen', 'laag', 1.229367::numeric, 'Tijdnorm 56,74 min + 30% standaard uurtoeslag = 73,76 min.', true),
  ('HR-C1-05', 'Repareren van een houtaantasting – 5 cm ((5x5x3)/2)', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Houtaantasting repareren', 'laag', 0.749233::numeric, 'Tijdnorm 34,58 min + 30% standaard uurtoeslag = 44,95 min.', true),
  ('HR-C1-10', 'Repareren van een houtaantasting – 10 cm ((10x5x4)/2)', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 20% verlies.', 'st', 'Houtaantasting repareren', 'laag', 1.199467::numeric, 'Tijdnorm 55,36 min + 30% standaard uurtoeslag = 71,97 min.', true),
  ('HR-C1-15', 'Repareren van een houtaantasting – 15 cm ((15x5x5)/2)', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 20% verlies.', 'st', 'Houtaantasting repareren', 'laag', 1.59835::numeric, 'Tijdnorm 73,77 min + 30% standaard uurtoeslag = 95,9 min.', true),
  ('HR-C2-025', 'Lamineren met delen hout – 25 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Hout plaatsen
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Lamineren met hout', 'laag', 0.916067::numeric, 'Tijdnorm 42,28 min + 30% standaard uurtoeslag = 54,96 min.', true),
  ('HR-C2-050', 'Lamineren met delen hout – 50 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Hout plaatsen
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Lamineren met hout', 'laag', 1.107167::numeric, 'Tijdnorm 51,1 min + 30% standaard uurtoeslag = 66,43 min.', true),
  ('HR-C2-100', 'Lamineren met delen hout – 100 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Hout plaatsen
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Lamineren met hout', 'laag', 1.3897::numeric, 'Tijdnorm 64,14 min + 30% standaard uurtoeslag = 83,38 min.', true),
  ('HR-C2-200', 'Lamineren met delen hout – 200 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Hout plaatsen
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Lamineren met hout', 'laag', 2.060283::numeric, 'Tijdnorm 95,09 min + 30% standaard uurtoeslag = 123,62 min.', true),
  ('HR-C2-300', 'Lamineren met delen hout – 300 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Hout plaatsen
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Lamineren met hout', 'laag', 2.654383::numeric, 'Tijdnorm 122,51 min + 30% standaard uurtoeslag = 159,26 min.', true),
  ('HR-C4-025', 'Deelvervanging – 25 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Hout plaatsen
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Deelvervanging', 'hoog', 0.853883::numeric, 'Tijdnorm 39,41 min + 30% standaard uurtoeslag = 51,23 min.', true),
  ('HR-C4-050', 'Deelvervanging – 50 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Hout plaatsen
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Deelvervanging', 'hoog', 0.9191::numeric, 'Tijdnorm 42,42 min + 30% standaard uurtoeslag = 55,15 min.', true),
  ('HR-C4-100', 'Deelvervanging – 100 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Hout plaatsen
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Deelvervanging', 'hoog', 0.986483::numeric, 'Tijdnorm 45,53 min + 30% standaard uurtoeslag = 59,19 min.', true),
  ('HR-C4-200', 'Deelvervanging – 200 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Hout plaatsen
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Deelvervanging', 'hoog', 1.539417::numeric, 'Tijdnorm 71,05 min + 30% standaard uurtoeslag = 92,37 min.', true),
  ('HR-C4-300', 'Deelvervanging – 300 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Hout plaatsen
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'st', 'Deelvervanging', 'hoog', 1.971883::numeric, 'Tijdnorm 91,01 min + 30% standaard uurtoeslag = 118,31 min.', true),
  ('HR-C4-ZWAAR', 'Deelvervanging – toeslag zwaar profiel', 'Prijs nader te bepalen (n.t.b.) — het prijsblad geeft hier geen bedrag.', 'st', 'Deelvervanging', 'hoog', 0::numeric, 'Geen tijdnorm — prijs nader te bepalen.', false),
  ('HR-OS-RN', 'Omtrekspeling – raam, niet uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.25::numeric, 'Tijdnorm 15 min.', true),
  ('HR-OS-RU', 'Omtrekspeling – raam, uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.5::numeric, 'Tijdnorm 30 min.', true),
  ('HR-OS-RS', 'Omtrekspeling – raam, incl. scharnierzijde', null::text, 'st', 'Omtrekspeling', 'laag', 0.75::numeric, 'Tijdnorm 45 min.', true),
  ('HR-OS-DN', 'Omtrekspeling – deur, niet uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.416667::numeric, 'Tijdnorm 25 min.', true),
  ('HR-OS-DU', 'Omtrekspeling – deur, uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.75::numeric, 'Tijdnorm 45 min.', true),
  ('HR-OS-DS', 'Omtrekspeling – deur, incl. scharnierzijde', null::text, 'st', 'Omtrekspeling', 'laag', 1.166667::numeric, 'Tijdnorm 70 min.', true),
  ('HR-BK', 'Beglazingskit vervangen', 'Afmeting min. 1 m1.', 'm1', 'Beglazing en latten', 'laag', 0.1::numeric, 'Tijdnorm 6 min.', true),
  ('HR-NL', 'Neuslat vervangen', 'Afmeting min. 1 m1.', 'm1', 'Beglazing en latten', 'hoog', 0.333333::numeric, 'Tijdnorm 20 min.', true),
  ('HR-GL', 'Glaslat vervangen', 'Afmeting min. 1 m1.', 'm1', 'Beglazing en latten', 'hoog', 0.25::numeric, 'Tijdnorm 15 min.', true),
  ('HR-SV', 'Stopverf vervangen', 'Afmeting 100 x(17x17/2) cm.
• Stopverf verwijderen
• Schuren
• Gronden
• Aanbrengen Dry Seal MP
• Gronden
Materiaalhoeveelheden inclusief 10% verlies.', 'm1', 'Beglazing en latten', 'laag', 0.2925::numeric, 'Tijdnorm 13,5 min + 30% standaard uurtoeslag = 17,55 min.', true),
  ('HR-DEUR-STAP', 'Stapeldorpeldeur vervangen', 'Afmeting max. 930x2115mm.
HR++ glas, 4 scharnieren, meerpuntsluiting, SKG** beslag.
• Demonteren
• Slot infrezen
• Deur op maat maken
• Scharnieren infrezen
• Kale hout gronden
• Afstellen van de deur
• Glas plaatsen en afkitten
• Beslag plaatsen
• Oude deur afvoeren
• Overige', 'st', 'Deuren en ramen vervangen', 'hoog', 6::numeric, 'Tijdnorm 360 min.', true),
  ('HR-DEUR-VLAK', 'Vlakke deur vervangen', 'Afmeting max. 930x2115mm.
40 mm alustabiel WBP, 4 scharnieren, meerpuntsluiting, SKG** beslag.
• Demonteren
• Slot infrezen
• Deur op maat maken
• Scharnieren infrezen
• Kale hout gronden
• Afstellen van de deur
• Beslag plaatsen
• Oude deur afvoeren
• Overige', 'st', 'Deuren en ramen vervangen', 'hoog', 6::numeric, 'Tijdnorm 360 min.', true),
  ('HR-RAAM-DRAAI', 'Draairaam vervangen', 'Afmeting max. 1 m2.', 'st', 'Deuren en ramen vervangen', 'hoog', 4::numeric, 'Tijdnorm 240 min.', true),
  ('HR-RAAM-KLEP', 'Klepraam vervangen', 'Afmeting max. 0,5m2.', 'st', 'Deuren en ramen vervangen', 'hoog', 3::numeric, 'Tijdnorm 180 min.', true),
  ('HR-DEMO', 'De/hermonteren t.b.v. herstelwerk', 'Afmeting max. 24kg.', 'post', 'Overig', 'laag', 1.5::numeric, 'Tijdnorm 90 min.', true)
), m(code, naam, unit, qty, prijs, eur) as (values
  ('HR-P2', 'Repair Care DRY FLEX® 4', 'ml', 14.52::numeric, 0.15::numeric, 2.178::numeric),
  ('HR-P2', 'Repair Care DRY FIX® UNI', 'ml', 8.69::numeric, 0.173333::numeric, 1.5063::numeric),
  ('HR-P2', 'Klein materiaal', 'post', 1::numeric, 1.94::numeric, 1.94::numeric),
  ('HR-P3', 'Repair Care DRY FLEX® 4', 'ml', 14.52::numeric, 0.15::numeric, 2.178::numeric),
  ('HR-P3', 'Repair Care DRY FIX® UNI', 'ml', 8.69::numeric, 0.173333::numeric, 1.5063::numeric),
  ('HR-P3', 'Klein materiaal', 'post', 1::numeric, 1.94::numeric, 1.94::numeric),
  ('HR-P10', 'Repair Care DRY FLEX® 4', 'ml', 14.52::numeric, 0.15::numeric, 2.178::numeric),
  ('HR-P10', 'Repair Care DRY FIX® UNI', 'ml', 8.69::numeric, 0.173333::numeric, 1.5063::numeric),
  ('HR-P10', 'Klein materiaal', 'post', 1::numeric, 1.94::numeric, 1.94::numeric),
  ('HR-P5', 'Repair Care DRY FLEX® 4', 'ml', 8.256::numeric, 0.15::numeric, 1.2384::numeric),
  ('HR-P5', 'Repair Care DRY FIX® UNI', 'ml', 1.8::numeric, 0.173333::numeric, 0.312::numeric),
  ('HR-P5', 'Klein materiaal', 'post', 1::numeric, 1.81::numeric, 1.81::numeric),
  ('HR-P4-025', 'Repair Care DRY FLEX® 4', 'ml', 30.25::numeric, 0.15::numeric, 4.5375::numeric),
  ('HR-P4-025', 'Repair Care DRY FIX® UNI', 'ml', 9.075::numeric, 0.173333::numeric, 1.573::numeric),
  ('HR-P4-025', 'Klein materiaal', 'post', 1::numeric, 2.32::numeric, 2.32::numeric),
  ('HR-P4-050', 'Repair Care DRY FLEX® 4', 'ml', 60.5::numeric, 0.15::numeric, 9.075::numeric),
  ('HR-P4-050', 'Repair Care DRY FIX® UNI', 'ml', 18.15::numeric, 0.173333::numeric, 3.146::numeric),
  ('HR-P4-050', 'Klein materiaal', 'post', 1::numeric, 4.59::numeric, 4.59::numeric),
  ('HR-P4-100', 'Repair Care DRY FLEX® 4', 'ml', 121::numeric, 0.15::numeric, 18.15::numeric),
  ('HR-P4-100', 'Repair Care DRY FIX® UNI', 'ml', 36.3::numeric, 0.173333::numeric, 6.292::numeric),
  ('HR-P4-100', 'Klein materiaal', 'post', 1::numeric, 8.73::numeric, 8.73::numeric),
  ('HR-P4-200', 'Repair Care DRY FLEX® 4', 'ml', 242::numeric, 0.15::numeric, 36.3::numeric),
  ('HR-P4-200', 'Repair Care DRY FIX® UNI', 'ml', 72.6::numeric, 0.173333::numeric, 12.584::numeric),
  ('HR-P4-200', 'Klein materiaal', 'post', 1::numeric, 17.47::numeric, 17.47::numeric),
  ('HR-P4-300', 'Repair Care DRY FLEX® 4', 'ml', 363::numeric, 0.15::numeric, 54.45::numeric),
  ('HR-P4-300', 'Repair Care DRY FIX® UNI', 'ml', 108.9::numeric, 0.173333::numeric, 18.876::numeric),
  ('HR-P4-300', 'Klein materiaal', 'post', 1::numeric, 26.75::numeric, 26.75::numeric),
  ('HR-C1-05', 'Repair Care DRY FLEX® 4', 'ml', 45.43::numeric, 0.15::numeric, 6.8145::numeric),
  ('HR-C1-05', 'Repair Care DRY FIX® UNI', 'ml', 5.5::numeric, 0.173333::numeric, 0.9533::numeric),
  ('HR-C1-05', 'Klein materiaal', 'post', 1::numeric, 2.5::numeric, 2.5::numeric),
  ('HR-C1-10', 'Repair Care DRY FLEX® 4', 'ml', 132::numeric, 0.15::numeric, 19.8::numeric),
  ('HR-C1-10', 'Repair Care DRY FIX® UNI', 'ml', 10.56::numeric, 0.173333::numeric, 1.8304::numeric),
  ('HR-C1-10', 'Klein materiaal', 'post', 1::numeric, 4.61::numeric, 4.61::numeric),
  ('HR-C1-15', 'Repair Care DRY FLEX® 4', 'ml', 247.56::numeric, 0.15::numeric, 37.134::numeric),
  ('HR-C1-15', 'Repair Care DRY FIX® UNI', 'ml', 14.52::numeric, 0.173333::numeric, 2.5168::numeric),
  ('HR-C1-15', 'Klein materiaal', 'post', 1::numeric, 8.24::numeric, 8.24::numeric),
  ('HR-C2-025', 'Repair Care DRY FLEX® 4', 'ml', 211.75::numeric, 0.15::numeric, 31.7625::numeric),
  ('HR-C2-025', 'Repair Care DRY FIX® UNI', 'ml', 42.35::numeric, 0.173333::numeric, 7.3407::numeric),
  ('HR-C2-025', 'Kozijnhout', 'm1', 0.275::numeric, 40::numeric, 11::numeric),
  ('HR-C2-025', 'Klein materiaal', 'post', 1::numeric, 8.7::numeric, 8.7::numeric),
  ('HR-C2-050', 'Repair Care DRY FLEX® 4', 'ml', 363::numeric, 0.15::numeric, 54.45::numeric),
  ('HR-C2-050', 'Repair Care DRY FIX® UNI', 'ml', 72.6::numeric, 0.173333::numeric, 12.584::numeric),
  ('HR-C2-050', 'Kozijnhout', 'm1', 0.55::numeric, 40::numeric, 22::numeric),
  ('HR-C2-050', 'Klein materiaal', 'post', 1::numeric, 17.4::numeric, 17.4::numeric),
  ('HR-C2-100', 'Repair Care DRY FLEX® 4', 'ml', 665.5::numeric, 0.15::numeric, 99.825::numeric),
  ('HR-C2-100', 'Repair Care DRY FIX® UNI', 'ml', 133.1::numeric, 0.173333::numeric, 23.0707::numeric),
  ('HR-C2-100', 'Kozijnhout', 'm1', 1.1::numeric, 40::numeric, 44::numeric),
  ('HR-C2-100', 'Klein materiaal', 'post', 1::numeric, 34.81::numeric, 34.81::numeric),
  ('HR-C2-200', 'Repair Care DRY FLEX® 4', 'ml', 1270.5::numeric, 0.15::numeric, 190.575::numeric),
  ('HR-C2-200', 'Repair Care DRY FIX® UNI', 'ml', 254.1::numeric, 0.173333::numeric, 44.044::numeric),
  ('HR-C2-200', 'Kozijnhout', 'm1', 2.2::numeric, 40::numeric, 88::numeric),
  ('HR-C2-200', 'Klein materiaal', 'post', 1::numeric, 69.62::numeric, 69.62::numeric),
  ('HR-C2-300', 'Repair Care DRY FLEX® 4', 'ml', 1875.5::numeric, 0.15::numeric, 281.325::numeric),
  ('HR-C2-300', 'Repair Care DRY FIX® UNI', 'ml', 375.1::numeric, 0.173333::numeric, 65.0173::numeric),
  ('HR-C2-300', 'Kozijnhout', 'm1', 3.3::numeric, 40::numeric, 132::numeric),
  ('HR-C2-300', 'Klein materiaal', 'post', 1::numeric, 104.43::numeric, 104.43::numeric),
  ('HR-C4-025', 'Repair Care DRY FLEX® 4', 'ml', 332.75::numeric, 0.15::numeric, 49.9125::numeric),
  ('HR-C4-025', 'Repair Care DRY FIX® UNI', 'ml', 13.31::numeric, 0.173333::numeric, 2.3071::numeric),
  ('HR-C4-025', 'Kozijnhout', 'm1', 0.275::numeric, 40::numeric, 11::numeric),
  ('HR-C4-025', 'Klein materiaal', 'post', 1::numeric, 15.15::numeric, 15.15::numeric),
  ('HR-C4-050', 'Repair Care DRY FLEX® 4', 'ml', 332.75::numeric, 0.15::numeric, 49.9125::numeric),
  ('HR-C4-050', 'Repair Care DRY FIX® UNI', 'ml', 13.31::numeric, 0.173333::numeric, 2.3071::numeric),
  ('HR-C4-050', 'Kozijnhout', 'm1', 0.55::numeric, 40::numeric, 22::numeric),
  ('HR-C4-050', 'Klein materiaal', 'post', 1::numeric, 16.25::numeric, 16.25::numeric),
  ('HR-C4-100', 'Repair Care DRY FLEX® 4', 'ml', 332.75::numeric, 0.15::numeric, 49.9125::numeric),
  ('HR-C4-100', 'Repair Care DRY FIX® UNI', 'ml', 13.31::numeric, 0.173333::numeric, 2.3071::numeric),
  ('HR-C4-100', 'Kozijnhout', 'm1', 1.1::numeric, 40::numeric, 44::numeric),
  ('HR-C4-100', 'Klein materiaal', 'post', 1::numeric, 18.45::numeric, 18.45::numeric),
  ('HR-C4-200', 'Repair Care DRY FLEX® 4', 'ml', 499.18::numeric, 0.15::numeric, 74.877::numeric),
  ('HR-C4-200', 'Repair Care DRY FIX® UNI', 'ml', 20.02::numeric, 0.173333::numeric, 3.4701::numeric),
  ('HR-C4-200', 'Kozijnhout', 'm1', 2.2::numeric, 40::numeric, 88::numeric),
  ('HR-C4-200', 'Klein materiaal', 'post', 1::numeric, 29.87::numeric, 29.87::numeric),
  ('HR-C4-300', 'Repair Care DRY FLEX® 4', 'ml', 665.5::numeric, 0.15::numeric, 99.825::numeric),
  ('HR-C4-300', 'Repair Care DRY FIX® UNI', 'ml', 26.62::numeric, 0.173333::numeric, 4.6141::numeric),
  ('HR-C4-300', 'Kozijnhout', 'm1', 3.3::numeric, 40::numeric, 132::numeric),
  ('HR-C4-300', 'Klein materiaal', 'post', 1::numeric, 41.3::numeric, 41.3::numeric),
  ('HR-OS-RS', 'Klein materiaal', 'post', 1::numeric, 16::numeric, 16::numeric),
  ('HR-OS-DS', 'Klein materiaal', 'post', 1::numeric, 32::numeric, 32::numeric),
  ('HR-BK', 'Klein materiaal', 'post', 1::numeric, 1::numeric, 1::numeric),
  ('HR-NL', 'Klein materiaal', 'post', 1::numeric, 11::numeric, 11::numeric),
  ('HR-GL', 'Klein materiaal', 'post', 1::numeric, 2.5::numeric, 2.5::numeric),
  ('HR-SV', 'Klein materiaal', 'post', 1::numeric, 14.3::numeric, 14.3::numeric),
  ('HR-DEUR-STAP', 'Deur, glas en beslag', 'post', 1::numeric, 847::numeric, 847::numeric),
  ('HR-DEUR-VLAK', 'Deur en beslag', 'post', 1::numeric, 697::numeric, 697::numeric)
), ins as (
  insert into public.paint_items (family_id, treatment_id, item_code, onderdeel, type, full_name, description, default_unit, groep, btw_tarief, marge_pct, source, active)
  select '00000000-0000-0000-0000-000000000001', '4745935e-8c99-5615-6a46-a05b5f3b6643', r.code, 'Houtrot', 'activiteit', r.naam, r.descr, r.eenheid, r.groep, r.btw, 27.5362, 'Prijslijst houtschade 2025', true
  from r returning id, item_code
), arbeid as (
  insert into public.paint_labor_norms (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate, cost_per_unit, uurtarief_label, description, active)
  select ins.id, '4745935e-8c99-5615-6a46-a05b5f3b6643', r.code, 'uur', r.uren, 48, round(r.uren * 48, 4), 'Arbeid timmerman', r.tijd, true
  from ins join r on r.code = ins.item_code where r.met_arbeid
)
insert into public.paint_material_norms (item_id, treatment_id, source_code, material_name, unit, quantity_per_unit, unit_price, cost_per_unit, norm_type, active)
select ins.id, '4745935e-8c99-5615-6a46-a05b5f3b6643', m.code, m.naam, m.unit, m.qty, m.prijs, m.eur, 'materiaal', true
from ins join m on m.code = ins.item_code;
