-- VAC-verrekenprijzen (externe info/VAC_Verrekenprijzen.xlsx) als recepten.
--
-- Het VAC-blad is omgekeerd opgebouwd: de verkoopprijs staat vast en wordt gesplitst in
-- 50% loon / 25% AK / 20% materiaal / 5% winst, bij een uurloon van EUR 39,70.
-- In EVA: marge_pct = 30 (AK 25% + winst 5%), materiaal als één post van 20% van de
-- verrekenprijs, uren = loonkostendeel / 39,70.
--
-- Arbeid hangt aan uursoort "Arbeid timmerman" (EUR 48,00) en niet aan de EUR 39,70
-- van het VAC-blad; de EVA-prijs komt daardoor circa 15% boven de VAC-verrekenprijs uit.
-- De verrekenprijs zelf staat in de omschrijving van elk recept.
--
-- Alleen de posities die de Everts-prijslijst (HR-*) nog niet dekt:
--   Houtwerk        -> categorie Houtrot
--   Beglazing       -> categorie Beglazing
--   Voegafdichting  -> categorie Beglazing
--   Metselwerk      -> categorie Gevelwerk
-- Buiten scope: Beton (11 posities). Overgeslagen: MPGHV, dubbel met GHMP.

-- Behandeling voor de nieuwe categorie Beglazing (zelfde patroon als maakRecept)
insert into public.paint_treatments (id, family_id, treatment_code, treatment_index_code, name, active)
values ('2d1663f5-7c81-505b-be32-6bff8ae4f889', '00000000-0000-0000-0000-000000000001', 'BE', 'BE', 'BE', true)
on conflict (id) do nothing;

-- Idempotent: eerst weg, dan opnieuw
delete from public.paint_labor_norms    where item_id in (select id from public.paint_items where item_code like 'VAC-%');
delete from public.paint_material_norms where item_id in (select id from public.paint_items where item_code like 'VAC-%');
delete from public.paint_items where item_code like 'VAC-%';

-- 54 recepten. De omschrijving wordt hieronder in SQL opgebouwd uit de kolommen,
-- zodat de vaste tekst niet 54 keer in dit bestand staat.
with r(code, naam, eenheid, onderdeel, groep, btw, minuten, materiaal, vac_prijs, herkomst, treatment) as (values
  ('VAC-GH001', 'Vervangen droge beglazingsprofielen', 'm1', 'Beglazing', 'Latten, profielen en dorpelafdekkers', 'laag', 5.34::numeric, 1.41::numeric, 7.06::numeric, 'Beglazing — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH022', 'Vervangen stopverfzoom in metaal, elastische stopverf', 'm1', 'Beglazing', 'Kit en stopverf', 'laag', 7.96::numeric, 2.11::numeric, 10.54::numeric, 'Beglazing — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH071-a', 'Aanbrengen dorpelafdekker (verlijmen), steenvezel geperst < 100 cm', 'st', 'Beglazing', 'Latten, profielen en dorpelafdekkers', 'hoog', 30.99::numeric, 8.2::numeric, 41.01::numeric, 'Beglazing — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH071-b', 'Aanbrengen dorpelafdekker (verlijmen), steenvezel geperst > 100 cm', 'm1', 'Beglazing', 'Latten, profielen en dorpelafdekkers', 'hoog', 37.27::numeric, 9.86::numeric, 49.32::numeric, 'Beglazing — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH081-a', 'Herplaatsen glas/paneel met nieuwe glaslatten 0,5-2 m2/stuks', 'm2', 'Beglazing', 'Glas herplaatsen', 'hoog', 59.24::numeric, 15.68::numeric, 78.4::numeric, 'Beglazing — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH081-b', 'Herplaatsen glas/paneel met nieuwe glaslatten 2-3 m2/stuk', 'm2', 'Beglazing', 'Glas herplaatsen', 'hoog', 76.68::numeric, 20.29::numeric, 101.47::numeric, 'Beglazing — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH081-c', 'Herplaatsen glas/paneel met nieuwe glaslatten >3 m2/stuk', 'm2', 'Beglazing', 'Glas herplaatsen', 'hoog', 88.66::numeric, 23.47::numeric, 117.33::numeric, 'Beglazing — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH101-a', 'Vervangen isolerend dubbelglas (binnenbeglazing), U-waarde < 1,2 W/m.2K 0,5-2 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 124.53::numeric, 32.96::numeric, 164.8::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH101-b', 'Vervangen isolerend dubbelglas (binnenbeglazing), U-waarde < 1,2 W/m.2K 2-3 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 138.13::numeric, 36.56::numeric, 182.79::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH101-c', 'Vervangen isolerend dubbelglas (binnenbeglazing), U-waarde < 1,2 W/m.2K >3 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 175.22::numeric, 46.38::numeric, 231.88::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH111-a', 'Vervangen isolerend dubbelglas (buitenbeglazing), U-waarde < 1,2 W/m.2K 0,5-2 m2/stuks', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 130.9::numeric, 34.65::numeric, 173.23::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH111-b', 'Vervangen isolerend dubbelglas (buitenbeglazing), U-waarde < 1,2 W/m.2K 2-3 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 138.79::numeric, 36.73::numeric, 183.66::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH111-c', 'Vervangen isolerend dubbelglas (buitenbeglazing), U-waarde < 1,2 W/m.2K >3 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 176.05::numeric, 46.59::numeric, 232.97::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH112-a', 'Vervangen enkelglas door isolerend dubbelglas (buitenbeglazing), U-waarde < 1,2 W/m.2K 0,5-2 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 106.99::numeric, 28.32::numeric, 141.59::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH112-b', 'Vervangen enkelglas door isolerend dubbelglas (buitenbeglazing), U-waarde < 1,2 W/m.2K 2-3 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 119.95::numeric, 31.75::numeric, 158.74::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GH112-c', 'Vervangen enkelglas door isolerend dubbelglas (buitenbeglazing), U-waarde < 1,2 W/m.2K >3 m2/stuk', 'm2', 'Beglazing', 'Glas vervangen', 'hoog', 155.07::numeric, 41.04::numeric, 205.21::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-GHMP', 'Meerprijs aanbrengen ventilatierooster', 'm1', 'Beglazing', 'Meerprijzen', 'hoog', 77.27::numeric, 20.45::numeric, 102.25::numeric, 'Beglazing — Vervangen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-HH001', 'Afronden scherpe kanten', 'm1', 'Houtrot', 'Overig houtwerk', 'hoog', 1.85::numeric, 0.49::numeric, 2.45::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH002', 'Aanbrengen vochtafsluitende laag (afdichtmiddel)', 'm1', 'Houtrot', 'Overig houtwerk', 'laag', 6.93::numeric, 1.83::numeric, 9.17::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH051', 'Inkorten deurkozijnstijlen < 50 mm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 20.56::numeric, 5.44::numeric, 27.21::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH054-a', 'Vervangen kozijnstijl (geheel) < 150 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 161.33::numeric, 42.7::numeric, 213.49::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH054-b', 'Vervangen kozijnstijl (geheel) 150-250 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 175.34::numeric, 46.41::numeric, 232.03::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH061-a', 'Vervangen tussendorpel kozijn < 150 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 169.41::numeric, 44.84::numeric, 224.19::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH061-b', 'Vervangen tussendorpel kozijn 150 -250 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 227.37::numeric, 60.18::numeric, 300.88::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH062-a', 'Vervangen dorpel met 1 stijlstuk < 250 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 230.73::numeric, 61.07::numeric, 305.33::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH062-b', 'Vervangen dorpel met 2 stijlstukken < 250 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 283.54::numeric, 75.04::numeric, 375.22::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH062-c', 'Vervangen dorpel met 3 stijlstukken < 250 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 372.59::numeric, 98.61::numeric, 493.06::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH062-d', 'Vervangen dorpel met 4 stijlstukken > 250 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 474.7::numeric, 125.64::numeric, 628.19::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH062-e', 'Vervangen dorpel met 5 stijlstukken > 250 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 550.53::numeric, 145.71::numeric, 728.53::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH063', 'Vervangen dorpel met 2 stijlstukken door kunststof < 110 cm', 'st', 'Houtrot', 'Dorpels en stijlen', 'hoog', 298.05::numeric, 78.88::numeric, 394.42::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH082', 'De- en monteren kozijnvulling (beglazing/panelen)', 'st', 'Houtrot', 'Overig houtwerk', 'hoog', 64.22::numeric, 17::numeric, 84.98::numeric, 'Houtwerk — Algemeen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH111', 'Vervangen weldorpel', 'st', 'Houtrot', 'Draaiende delen', 'hoog', 52.63::numeric, 13.93::numeric, 69.65::numeric, 'Houtwerk — Draaiende delen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH112', 'Aanbrengen weldorpel', 'st', 'Houtrot', 'Draaiende delen', 'hoog', 42.06::numeric, 11.13::numeric, 55.66::numeric, 'Houtwerk — Draaiende delen', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH171', 'Herstellen triplex deel < 30 cm', 'st', 'Houtrot', 'Gevelbekleding', 'hoog', 43.55::numeric, 11.53::numeric, 57.63::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH172-a', 'Vervangen triplex beplating < 30 cm', 'm1', 'Houtrot', 'Gevelbekleding', 'hoog', 52.82::numeric, 13.98::numeric, 69.9::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH172-b', 'Vervangen triplex beplating > 30 cm', 'm2', 'Houtrot', 'Gevelbekleding', 'hoog', 75.61::numeric, 20.01::numeric, 100.06::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH173', 'Vervangen volhouten deel, gedeeltelijk < 30 cm', 'm1', 'Houtrot', 'Gevelbekleding', 'hoog', 44.95::numeric, 11.9::numeric, 59.49::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH174', 'Vervangen volhouten deel, geheel', 'm1', 'Houtrot', 'Gevelbekleding', 'hoog', 69.73::numeric, 18.45::numeric, 92.27::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH181-a', 'Vervangen rabat/schroten bekleding 18 x 127 mm', 'm1', 'Houtrot', 'Gevelbekleding', 'hoog', 33.08::numeric, 8.75::numeric, 43.77::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HH181-b', 'Vervangen rabat/schroten bekleding 18 x137 mm', 'm2', 'Houtrot', 'Gevelbekleding', 'hoog', 119.9::numeric, 31.73::numeric, 158.67::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HHMPHD', 'Meerprijs herstellen daktrim', 'm1', 'Houtrot', 'Gevelbekleding', 'hoog', 23.8::numeric, 6.3::numeric, 31.5::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-HHMPRW', 'Meerprijs vervangen regelwerk', 'm1', 'Houtrot', 'Gevelbekleding', 'hoog', 18.89::numeric, 5::numeric, 25::numeric, 'Houtwerk — Gevelbekleding', '4745935e-8c99-5615-6a46-a05b5f3b6643'::uuid),
  ('VAC-MN002', 'Vervangen voegwerk in metselwerk VH35', 'm2', 'Gevelwerk', 'Voegwerk', 'hoog', 36.86::numeric, 9.76::numeric, 48.78::numeric, 'Metselwerk — Vervangen materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-MN003', 'Vervangen voegwerk tussen raamdorpelstenen', 'm1', 'Gevelwerk', 'Voegwerk', 'hoog', 15.27::numeric, 4.04::numeric, 20.21::numeric, 'Metselwerk — Vervangen materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-MR001-a', 'Repareren scheur (uittanden) < 0,5 m1 (< 8 lagen)', 'st', 'Gevelwerk', 'Metselwerk repareren', 'hoog', 63.57::numeric, 16.83::numeric, 84.13::numeric, 'Metselwerk — Repareren materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-MR001-b', 'Repareren scheur (uittanden) > 0,5 m1 (> 8 lagen)', 'm1', 'Gevelwerk', 'Metselwerk repareren', 'hoog', 71.98::numeric, 19.05::numeric, 95.25::numeric, 'Metselwerk — Repareren materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-MR002', 'Vervangen beschadigde baksteen', 'st', 'Gevelwerk', 'Metselwerk repareren', 'hoog', 17::numeric, 4.5::numeric, 22.5::numeric, 'Metselwerk — Repareren materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-MR003', 'Vervangen beschadigde of losse raamdorpelsteen', 'st', 'Gevelwerk', 'Metselwerk repareren', 'hoog', 23.95::numeric, 6.34::numeric, 31.7::numeric, 'Metselwerk — Repareren materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-MR011-a', 'Repareren voegwerk, plaatselijk (metselstenen) VH35 (totale omvang < 25 m2)', 'm2', 'Gevelwerk', 'Voegwerk', 'hoog', 31.85::numeric, 8.43::numeric, 42.15::numeric, 'Metselwerk — Repareren materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-MR011-b', 'Repareren voegwerk, plaatselijk (metselstenen) VH35 (totale omvang > 25 m2)', 'm2', 'Gevelwerk', 'Voegwerk', 'hoog', 29.36::numeric, 7.77::numeric, 38.85::numeric, 'Metselwerk — Repareren materiaal/constructie', '99e65cab-f745-5541-9e64-57f719e67520'::uuid),
  ('VAC-VH010', 'Vervangen flexibele afdichting, kit (gevel)', 'm1', 'Beglazing', 'Kit en stopverf', 'hoog', 22.89::numeric, 6.06::numeric, 30.29::numeric, 'Voegafdichtingen — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-VH011', 'Vervangen flexibele afdichting, kit (vloer)', 'm1', 'Beglazing', 'Kit en stopverf', 'hoog', 27.96::numeric, 7.4::numeric, 37::numeric, 'Voegafdichtingen — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-VH031', 'Vervangen flexibele afdichting, brugvoeg (bestaande kitvoeg', 'm1', 'Beglazing', 'Kit en stopverf', 'hoog', 51.13::numeric, 13.53::numeric, 67.66::numeric, 'Voegafdichtingen — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid),
  ('VAC-VH032', 'Vervangen flexibele afdichting, kitvoeg en brugvoeg', 'm1', 'Beglazing', 'Kit en stopverf', 'hoog', 61.22::numeric, 16.2::numeric, 81.01::numeric, 'Voegafdichtingen — Herstellen materiaal/constructie', '2d1663f5-7c81-505b-be32-6bff8ae4f889'::uuid)
), t as (
  select r.*,
    r.minuten / 60 as uren,
    r.naam || E'\n'
      || 'VAC-verrekenprijs 2025: EUR ' || replace(to_char(r.vac_prijs, 'FM9999990.00'), '.', ',') || ' per ' || r.eenheid
      || ' (excl. btw), onderdeel ' || r.herkomst || '.' || E'\n'
      || 'Opbouw uit het VAC-blad: ' || replace(to_char(r.minuten, 'FM9999990.00'), '.', ',') || ' min arbeid (loonkostendeel bij EUR 39,70 per uur) en EUR '
      || replace(to_char(r.materiaal, 'FM9999990.00'), '.', ',') || ' materiaal (20% van de verrekenprijs).' as descr,
    'Tijdnorm ' || replace(to_char(r.minuten, 'FM9999990.00'), '.', ',') || ' min, uit het loonkostendeel van de VAC-verrekenprijs.' as tijd
  from r
), ins as (
  insert into public.paint_items (family_id, treatment_id, item_code, onderdeel, type, full_name, description, default_unit, groep, btw_tarief, marge_pct, source, active)
  select '00000000-0000-0000-0000-000000000001', t.treatment, t.code, t.onderdeel, 'activiteit', t.naam, t.descr, t.eenheid, t.groep, t.btw, 30, 'VAC verrekenprijzen', true
  from t returning id, item_code
), arbeid as (
  insert into public.paint_labor_norms (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate, cost_per_unit, uurtarief_label, description, active)
  select ins.id, t.treatment, t.code, 'uur', round(t.uren, 6), 48, round(round(t.uren, 6) * 48, 4), 'Arbeid timmerman', t.tijd, true
  from ins join t on t.code = ins.item_code
)
insert into public.paint_material_norms (item_id, treatment_id, source_code, material_name, unit, quantity_per_unit, unit_price, cost_per_unit, norm_type, active)
select ins.id, t.treatment, t.code, 'Materiaal', 'post', 1, t.materiaal, t.materiaal, 'materiaal', true
from ins join t on t.code = ins.item_code where t.materiaal > 0;
