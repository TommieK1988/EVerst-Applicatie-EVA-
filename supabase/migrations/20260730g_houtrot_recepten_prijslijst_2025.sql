-- Houtrotrecepten + materialen uit "Prijslijst houtschade 2025.xls".
-- Tabblad Totaal is leidend:
--   verkoop = ((tijdnorm x (1 + uurtoeslag)) / 60 x uurtarief + materiaal) x 1,38   (AK 25% + W&R 13%)
-- Arbeid hangt aan uursoort "Arbeid timmerman" (EUR 48,00); de prijslijst rekende zelf met EUR 45,00.
-- Materiaal: epoxy (DRY FLEX 4) en fix (DRY FIX UNI) apart, kozijnhout apart, overige
-- verbruiksartikelen samengevoegd in één post "Klein materiaal".

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
with r(code, naam, descr, eenheid, groep, btw, uren, tijd) as (values
  ('HR-P2', 'Afdichten van verbindingen – buitenzijde', 'Afmeting 12 x 1 x 1.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Verbindingen afdichten', 'laag', 0.423583::numeric, 'Tijdnorm 19,55 min + 30% standaard uurtoeslag = 25,41 min.'),
  ('HR-P3', 'Afdichten van verbindingen – neut', 'Afmeting 12 x 1 x 1.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Verbindingen afdichten', 'laag', 0.442217::numeric, 'Tijdnorm 20,41 min + 30% standaard uurtoeslag = 26,53 min.'),
  ('HR-P10', 'Afdichten van verbindingen – binnenzijde', 'Afmeting 12 x 1 x 1.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Verbindingen afdichten', 'laag', 0.430733::numeric, 'Tijdnorm 19,88 min + 30% standaard uurtoeslag = 25,84 min.'),
  ('HR-P5', 'Herstellen van noesten / kwasten', 'Afmeting 2 x 2 cm.
• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Noesten en kwasten', 'laag', 0.347317::numeric, 'Tijdnorm 16,03 min + 30% standaard uurtoeslag = 20,84 min.'),
  ('HR-P4-025', 'Herstellen van scheuren – 25 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Scheuren herstellen', 'laag', 0.477273::numeric, 'Tijdnorm 22,03 min + 30% standaard uurtoeslag = 28,64 min.'),
  ('HR-P4-050', 'Herstellen van scheuren – 50 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Scheuren herstellen', 'laag', 0.733178::numeric, 'Tijdnorm 33,84 min + 30% standaard uurtoeslag = 43,99 min.'),
  ('HR-P4-100', 'Herstellen van scheuren – 100 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Scheuren herstellen', 'laag', 0.940767::numeric, 'Tijdnorm 43,42 min + 30% standaard uurtoeslag = 56,45 min.'),
  ('HR-P4-200', 'Herstellen van scheuren – 200 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Scheuren herstellen', 'laag', 1.26581::numeric, 'Tijdnorm 58,42 min + 30% standaard uurtoeslag = 75,95 min.'),
  ('HR-P4-300', 'Herstellen van scheuren – 300 cm', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Scheuren herstellen', 'laag', 1.229367::numeric, 'Tijdnorm 56,74 min + 30% standaard uurtoeslag = 73,76 min.'),
  ('HR-C1-05', 'Repareren van een houtaantasting – 5 cm ((5x5x3)/2)', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Houtaantasting repareren', 'laag', 0.749233::numeric, 'Tijdnorm 34,58 min + 30% standaard uurtoeslag = 44,95 min.'),
  ('HR-C1-10', 'Repareren van een houtaantasting – 10 cm ((10x5x4)/2)', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Houtaantasting repareren', 'laag', 1.199467::numeric, 'Tijdnorm 55,36 min + 30% standaard uurtoeslag = 71,97 min.'),
  ('HR-C1-15', 'Repareren van een houtaantasting – 15 cm ((15x5x5)/2)', '• Verf verwijderen
• Frezen
• Schuren
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Houtaantasting repareren', 'laag', 1.59835::numeric, 'Tijdnorm 73,77 min + 30% standaard uurtoeslag = 95,9 min.'),
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
• Gronden', 'st', 'Lamineren met hout', 'laag', 0.916067::numeric, 'Tijdnorm 42,28 min + 30% standaard uurtoeslag = 54,96 min.'),
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
• Gronden', 'st', 'Lamineren met hout', 'laag', 1.107167::numeric, 'Tijdnorm 51,1 min + 30% standaard uurtoeslag = 66,43 min.'),
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
• Gronden', 'st', 'Lamineren met hout', 'laag', 1.3897::numeric, 'Tijdnorm 64,14 min + 30% standaard uurtoeslag = 83,38 min.'),
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
• Gronden', 'st', 'Lamineren met hout', 'laag', 2.060283::numeric, 'Tijdnorm 95,09 min + 30% standaard uurtoeslag = 123,62 min.'),
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
• Gronden', 'st', 'Lamineren met hout', 'laag', 2.654383::numeric, 'Tijdnorm 122,51 min + 30% standaard uurtoeslag = 159,26 min.'),
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
• Gronden', 'st', 'Deelvervanging', 'hoog', 0.853883::numeric, 'Tijdnorm 39,41 min + 30% standaard uurtoeslag = 51,23 min.'),
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
• Gronden', 'st', 'Deelvervanging', 'hoog', 0.9191::numeric, 'Tijdnorm 42,42 min + 30% standaard uurtoeslag = 55,15 min.'),
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
• Gronden', 'st', 'Deelvervanging', 'hoog', 0.986483::numeric, 'Tijdnorm 45,53 min + 30% standaard uurtoeslag = 59,19 min.'),
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
• Gronden', 'st', 'Deelvervanging', 'hoog', 1.539417::numeric, 'Tijdnorm 71,05 min + 30% standaard uurtoeslag = 92,37 min.'),
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
• Gronden', 'st', 'Deelvervanging', 'hoog', 1.971883::numeric, 'Tijdnorm 91,01 min + 30% standaard uurtoeslag = 118,31 min.'),
  ('HR-C4-025S', 'Deelvervanging – stijlstuk 25 cm', '• Verf verwijderen
• Zagen
• Frezen
• Schuren
• Hout plaatsen
• Aanbrengen impregneer
• Aanbrengen reparatiemateriaal
• Schuren
• Plamuren
• Schuren
• Gronden', 'st', 'Deelvervanging', 'hoog', 0.853883::numeric, 'Tijdnorm 39,41 min + 30% standaard uurtoeslag = 51,23 min.'),
  ('HR-OS-RN', 'Omtrekspeling – raam, niet uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.25::numeric, 'Tijdnorm 15 min.'),
  ('HR-OS-RU', 'Omtrekspeling – raam, uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.5::numeric, 'Tijdnorm 30 min.'),
  ('HR-OS-RS', 'Omtrekspeling – raam, incl. scharnierzijde', null::text, 'st', 'Omtrekspeling', 'laag', 0.75::numeric, 'Tijdnorm 45 min.'),
  ('HR-OS-DN', 'Omtrekspeling – deur, niet uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.416667::numeric, 'Tijdnorm 25 min.'),
  ('HR-OS-DU', 'Omtrekspeling – deur, uitnemen', null::text, 'st', 'Omtrekspeling', 'laag', 0.75::numeric, 'Tijdnorm 45 min.'),
  ('HR-OS-DS', 'Omtrekspeling – deur, incl. scharnierzijde', null::text, 'st', 'Omtrekspeling', 'laag', 1.166667::numeric, 'Tijdnorm 70 min.'),
  ('HR-BK', 'Beglazingskit vervangen', 'Afmeting min. 1 m1.', 'm1', 'Beglazing en latten', 'laag', 0.1::numeric, 'Tijdnorm 6 min.'),
  ('HR-NL', 'Neuslat vervangen', 'Afmeting min. 1 m1.', 'm1', 'Beglazing en latten', 'hoog', 0.333333::numeric, 'Tijdnorm 20 min.'),
  ('HR-GL', 'Glaslat vervangen', 'Afmeting min. 1 m1.', 'm1', 'Beglazing en latten', 'hoog', 0.25::numeric, 'Tijdnorm 15 min.'),
  ('HR-SV', 'Stopverf vervangen', 'Afmeting 100 x(17x17/2) cm.
• Stopverf verwijderen
• Schuren
• Gronden
• Aanbrengen Dry Seal MP
• Gronden', 'm1', 'Beglazing en latten', 'laag', 0.2925::numeric, 'Tijdnorm 13,5 min + 30% standaard uurtoeslag = 17,55 min.'),
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
• Overige', 'st', 'Deuren en ramen vervangen', 'hoog', 6::numeric, 'Tijdnorm 360 min.'),
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
• Overige', 'st', 'Deuren en ramen vervangen', 'hoog', 6::numeric, 'Tijdnorm 360 min.'),
  ('HR-RAAM-DRAAI', 'Draairaam vervangen', 'Afmeting max. 1 m2.', 'st', 'Deuren en ramen vervangen', 'hoog', 4::numeric, 'Tijdnorm 240 min.'),
  ('HR-RAAM-KLEP', 'Klepraam vervangen', 'Afmeting max. 0,5m2.', 'st', 'Deuren en ramen vervangen', 'hoog', 3::numeric, 'Tijdnorm 180 min.'),
  ('HR-DEMO', 'De/hermonteren t.b.v. herstelwerk', 'Afmeting max. 24kg.', 'post', 'Overig', 'laag', 1.5::numeric, 'Tijdnorm 90 min.')
), m(code, naam, unit, qty, prijs, eur) as (values
  ('HR-P2', 'Repair Care DRY FLEX® 4', 'ml', 13.2::numeric, 0.15::numeric, 1.98::numeric),
  ('HR-P2', 'Repair Care DRY FIX® UNI', 'ml', 7.9::numeric, 0.173333::numeric, 1.3693::numeric),
  ('HR-P2', 'Klein materiaal', 'post', 1::numeric, 1.76::numeric, 1.76::numeric),
  ('HR-P3', 'Repair Care DRY FLEX® 4', 'ml', 13.2::numeric, 0.15::numeric, 1.98::numeric),
  ('HR-P3', 'Repair Care DRY FIX® UNI', 'ml', 7.9::numeric, 0.173333::numeric, 1.3693::numeric),
  ('HR-P3', 'Klein materiaal', 'post', 1::numeric, 1.76::numeric, 1.76::numeric),
  ('HR-P10', 'Repair Care DRY FLEX® 4', 'ml', 13.2::numeric, 0.15::numeric, 1.98::numeric),
  ('HR-P10', 'Repair Care DRY FIX® UNI', 'ml', 7.9::numeric, 0.173333::numeric, 1.3693::numeric),
  ('HR-P10', 'Klein materiaal', 'post', 1::numeric, 1.76::numeric, 1.76::numeric),
  ('HR-P5', 'Repair Care DRY FLEX® 4', 'ml', 6.88::numeric, 0.15::numeric, 1.032::numeric),
  ('HR-P5', 'Repair Care DRY FIX® UNI', 'ml', 1.5::numeric, 0.173333::numeric, 0.26::numeric),
  ('HR-P5', 'Klein materiaal', 'post', 1::numeric, 1.51::numeric, 1.51::numeric),
  ('HR-P4-025', 'Repair Care DRY FLEX® 4', 'ml', 27.5::numeric, 0.15::numeric, 4.125::numeric),
  ('HR-P4-025', 'Repair Care DRY FIX® UNI', 'ml', 8.25::numeric, 0.173333::numeric, 1.43::numeric),
  ('HR-P4-025', 'Klein materiaal', 'post', 1::numeric, 2.11::numeric, 2.11::numeric),
  ('HR-P4-050', 'Repair Care DRY FLEX® 4', 'ml', 55::numeric, 0.15::numeric, 8.25::numeric),
  ('HR-P4-050', 'Repair Care DRY FIX® UNI', 'ml', 16.5::numeric, 0.173333::numeric, 2.86::numeric),
  ('HR-P4-050', 'Klein materiaal', 'post', 1::numeric, 3.45::numeric, 3.45::numeric),
  ('HR-P4-100', 'Repair Care DRY FLEX® 4', 'ml', 110::numeric, 0.15::numeric, 16.5::numeric),
  ('HR-P4-100', 'Repair Care DRY FIX® UNI', 'ml', 33::numeric, 0.173333::numeric, 5.72::numeric),
  ('HR-P4-100', 'Klein materiaal', 'post', 1::numeric, 7.94::numeric, 7.94::numeric),
  ('HR-P4-200', 'Repair Care DRY FLEX® 4', 'ml', 220::numeric, 0.15::numeric, 33::numeric),
  ('HR-P4-200', 'Repair Care DRY FIX® UNI', 'ml', 66::numeric, 0.173333::numeric, 11.44::numeric),
  ('HR-P4-200', 'Klein materiaal', 'post', 1::numeric, 15.88::numeric, 15.88::numeric),
  ('HR-P4-300', 'Repair Care DRY FLEX® 4', 'ml', 330::numeric, 0.15::numeric, 49.5::numeric),
  ('HR-P4-300', 'Repair Care DRY FIX® UNI', 'ml', 99::numeric, 0.173333::numeric, 17.16::numeric),
  ('HR-P4-300', 'Klein materiaal', 'post', 1::numeric, 24.32::numeric, 24.32::numeric),
  ('HR-C1-05', 'Repair Care DRY FLEX® 4', 'ml', 41.3::numeric, 0.15::numeric, 6.195::numeric),
  ('HR-C1-05', 'Repair Care DRY FIX® UNI', 'ml', 5::numeric, 0.173333::numeric, 0.8667::numeric),
  ('HR-C1-05', 'Klein materiaal', 'post', 1::numeric, 2.28::numeric, 2.28::numeric),
  ('HR-C1-10', 'Repair Care DRY FLEX® 4', 'ml', 110::numeric, 0.15::numeric, 16.5::numeric),
  ('HR-C1-10', 'Repair Care DRY FIX® UNI', 'ml', 8.8::numeric, 0.173333::numeric, 1.5253::numeric),
  ('HR-C1-10', 'Klein materiaal', 'post', 1::numeric, 3.84::numeric, 3.84::numeric),
  ('HR-C1-15', 'Repair Care DRY FLEX® 4', 'ml', 206.3::numeric, 0.15::numeric, 30.945::numeric),
  ('HR-C1-15', 'Repair Care DRY FIX® UNI', 'ml', 12.1::numeric, 0.173333::numeric, 2.0973::numeric),
  ('HR-C1-15', 'Klein materiaal', 'post', 1::numeric, 6.87::numeric, 6.87::numeric),
  ('HR-C2-025', 'Repair Care DRY FLEX® 4', 'ml', 192.5::numeric, 0.15::numeric, 28.875::numeric),
  ('HR-C2-025', 'Repair Care DRY FIX® UNI', 'ml', 38.5::numeric, 0.173333::numeric, 6.6733::numeric),
  ('HR-C2-025', 'Kozijnhout', 'm1', 0.25::numeric, 40::numeric, 10::numeric),
  ('HR-C2-025', 'Klein materiaal', 'post', 1::numeric, 7.91::numeric, 7.91::numeric),
  ('HR-C2-050', 'Repair Care DRY FLEX® 4', 'ml', 330::numeric, 0.15::numeric, 49.5::numeric),
  ('HR-C2-050', 'Repair Care DRY FIX® UNI', 'ml', 66::numeric, 0.173333::numeric, 11.44::numeric),
  ('HR-C2-050', 'Kozijnhout', 'm1', 0.5::numeric, 40::numeric, 20::numeric),
  ('HR-C2-050', 'Klein materiaal', 'post', 1::numeric, 15.82::numeric, 15.82::numeric),
  ('HR-C2-100', 'Repair Care DRY FLEX® 4', 'ml', 605::numeric, 0.15::numeric, 90.75::numeric),
  ('HR-C2-100', 'Repair Care DRY FIX® UNI', 'ml', 121::numeric, 0.173333::numeric, 20.9733::numeric),
  ('HR-C2-100', 'Kozijnhout', 'm1', 1::numeric, 40::numeric, 40::numeric),
  ('HR-C2-100', 'Klein materiaal', 'post', 1::numeric, 31.64::numeric, 31.64::numeric),
  ('HR-C2-200', 'Repair Care DRY FLEX® 4', 'ml', 1155::numeric, 0.15::numeric, 173.25::numeric),
  ('HR-C2-200', 'Repair Care DRY FIX® UNI', 'ml', 231::numeric, 0.173333::numeric, 40.04::numeric),
  ('HR-C2-200', 'Kozijnhout', 'm1', 2::numeric, 40::numeric, 80::numeric),
  ('HR-C2-200', 'Klein materiaal', 'post', 1::numeric, 63.29::numeric, 63.29::numeric),
  ('HR-C2-300', 'Repair Care DRY FLEX® 4', 'ml', 1705::numeric, 0.15::numeric, 255.75::numeric),
  ('HR-C2-300', 'Repair Care DRY FIX® UNI', 'ml', 341::numeric, 0.173333::numeric, 59.1067::numeric),
  ('HR-C2-300', 'Kozijnhout', 'm1', 3::numeric, 40::numeric, 120::numeric),
  ('HR-C2-300', 'Klein materiaal', 'post', 1::numeric, 94.93::numeric, 94.93::numeric),
  ('HR-C4-025', 'Repair Care DRY FLEX® 4', 'ml', 302.5::numeric, 0.15::numeric, 45.375::numeric),
  ('HR-C4-025', 'Repair Care DRY FIX® UNI', 'ml', 12.1::numeric, 0.173333::numeric, 2.0973::numeric),
  ('HR-C4-025', 'Kozijnhout', 'm1', 0.25::numeric, 40::numeric, 10::numeric),
  ('HR-C4-025', 'Klein materiaal', 'post', 1::numeric, 13.77::numeric, 13.77::numeric),
  ('HR-C4-050', 'Repair Care DRY FLEX® 4', 'ml', 302.5::numeric, 0.15::numeric, 45.375::numeric),
  ('HR-C4-050', 'Repair Care DRY FIX® UNI', 'ml', 12.1::numeric, 0.173333::numeric, 2.0973::numeric),
  ('HR-C4-050', 'Kozijnhout', 'm1', 0.5::numeric, 40::numeric, 20::numeric),
  ('HR-C4-050', 'Klein materiaal', 'post', 1::numeric, 14.77::numeric, 14.77::numeric),
  ('HR-C4-100', 'Repair Care DRY FLEX® 4', 'ml', 302.5::numeric, 0.15::numeric, 45.375::numeric),
  ('HR-C4-100', 'Repair Care DRY FIX® UNI', 'ml', 12.1::numeric, 0.173333::numeric, 2.0973::numeric),
  ('HR-C4-100', 'Kozijnhout', 'm1', 1::numeric, 40::numeric, 40::numeric),
  ('HR-C4-100', 'Klein materiaal', 'post', 1::numeric, 16.77::numeric, 16.77::numeric),
  ('HR-C4-200', 'Repair Care DRY FLEX® 4', 'ml', 453.8::numeric, 0.15::numeric, 68.07::numeric),
  ('HR-C4-200', 'Repair Care DRY FIX® UNI', 'ml', 18.2::numeric, 0.173333::numeric, 3.1547::numeric),
  ('HR-C4-200', 'Kozijnhout', 'm1', 2::numeric, 40::numeric, 80::numeric),
  ('HR-C4-200', 'Klein materiaal', 'post', 1::numeric, 27.16::numeric, 27.16::numeric),
  ('HR-C4-300', 'Repair Care DRY FLEX® 4', 'ml', 605::numeric, 0.15::numeric, 90.75::numeric),
  ('HR-C4-300', 'Repair Care DRY FIX® UNI', 'ml', 24.2::numeric, 0.173333::numeric, 4.1947::numeric),
  ('HR-C4-300', 'Kozijnhout', 'm1', 3::numeric, 40::numeric, 120::numeric),
  ('HR-C4-300', 'Klein materiaal', 'post', 1::numeric, 37.54::numeric, 37.54::numeric),
  ('HR-C4-025S', 'Repair Care DRY FLEX® 4', 'ml', 302.5::numeric, 0.15::numeric, 45.375::numeric),
  ('HR-C4-025S', 'Repair Care DRY FIX® UNI', 'ml', 12.1::numeric, 0.173333::numeric, 2.0973::numeric),
  ('HR-C4-025S', 'Kozijnhout', 'm1', 0.25::numeric, 40::numeric, 10::numeric),
  ('HR-C4-025S', 'Klein materiaal', 'post', 1::numeric, 13.77::numeric, 13.77::numeric),
  ('HR-OS-RS', 'Klein materiaal', 'post', 1::numeric, 16::numeric, 16::numeric),
  ('HR-OS-DS', 'Klein materiaal', 'post', 1::numeric, 32::numeric, 32::numeric),
  ('HR-BK', 'Klein materiaal', 'post', 1::numeric, 1::numeric, 1::numeric),
  ('HR-NL', 'Klein materiaal', 'post', 1::numeric, 11::numeric, 11::numeric),
  ('HR-GL', 'Klein materiaal', 'post', 1::numeric, 2.5::numeric, 2.5::numeric),
  ('HR-SV', 'Klein materiaal', 'post', 1::numeric, 13::numeric, 13::numeric),
  ('HR-DEUR-STAP', 'Deur, glas en beslag', 'post', 1::numeric, 847::numeric, 847::numeric),
  ('HR-DEUR-VLAK', 'Deur en beslag', 'post', 1::numeric, 697::numeric, 697::numeric)
), ins as (
  insert into public.paint_items (family_id, treatment_id, item_code, onderdeel, type, full_name, description, default_unit, groep, btw_tarief, marge_pct, source, active)
  select '00000000-0000-0000-0000-000000000001', '4745935e-8c99-5615-6a46-a05b5f3b6643', r.code, 'Houtrot', 'activiteit', r.naam, r.descr, r.eenheid, r.groep, r.btw, 27.5362, 'Prijslijst houtschade 2025', true
  from r returning id, item_code
), arbeid as (
  insert into public.paint_labor_norms (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate, cost_per_unit, uurtarief_label, description, active)
  select ins.id, '4745935e-8c99-5615-6a46-a05b5f3b6643', r.code, 'uur', r.uren, 48, round(r.uren * 48, 4), 'Arbeid timmerman', r.tijd, true
  from ins join r on r.code = ins.item_code
)
insert into public.paint_material_norms (item_id, treatment_id, source_code, material_name, unit, quantity_per_unit, unit_price, cost_per_unit, norm_type, active)
select ins.id, '4745935e-8c99-5615-6a46-a05b5f3b6643', m.code, m.naam, m.unit, m.qty, m.prijs, m.eur, 'materiaal', true
from ins join m on m.code = ins.item_code;
