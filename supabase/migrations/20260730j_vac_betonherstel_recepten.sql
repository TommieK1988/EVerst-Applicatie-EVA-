-- Betonherstel uit VAC_Verrekenprijzen.xlsx, als aanvulling op 20260730i.
-- Zelfde opbouw: verkoopprijs vast, 50% loon / 25% AK / 20% materiaal / 5% winst bij EUR 39,70 per uur.
-- Categorie Betonherstel; arbeid op uursoort "Arbeid timmerman" (EUR 48,00), dus circa 15% boven de verrekenprijs.

delete from public.paint_labor_norms    where item_id in (select id from public.paint_items where item_code like 'VAC-BH%');
delete from public.paint_material_norms where item_id in (select id from public.paint_items where item_code like 'VAC-BH%');
delete from public.paint_items where item_code like 'VAC-BH%';

with r(code, naam, eenheid, groep, btw, minuten, materiaal, vac_prijs) as (values
  ('VAC-BH002', 'Vervangen afdichting hijspunt met PC-mortel', 'st', 'Esthetische reparaties', 'laag', 29.4::numeric, 7.78::numeric, 38.9::numeric),
  ('VAC-BH003-a', 'Herstellen betonschade met een PC-mortel (geen vrijkomende wapening) < 50 cm2', 'st', 'Esthetische reparaties', 'laag', 38.33::numeric, 10.14::numeric, 50.72::numeric),
  ('VAC-BH003-b', 'Herstellen betonschade met een PC-mortel (geen vrijkomende wapening) 50-150 cm2', 'st', 'Esthetische reparaties', 'laag', 64.35::numeric, 17.03::numeric, 85.16::numeric),
  ('VAC-BH021-a', 'Herstellen betonschade met een PCC-mortel (handmatig ontroesten St2) < 100 cm3', 'st', 'Technische reparaties', 'hoog', 44.94::numeric, 11.89::numeric, 59.47::numeric),
  ('VAC-BH021-b', 'Herstellen betonschade met een PCC-mortel (handmatig ontroesten St2) 100-500 cm3', 'st', 'Technische reparaties', 'hoog', 76.92::numeric, 20.36::numeric, 101.79::numeric),
  ('VAC-BH021-c', 'Herstellen betonschade met een PCC-mortel (handmatig ontroesten St2) 500-1.000 cm3', 'st', 'Technische reparaties', 'hoog', 140.52::numeric, 37.19::numeric, 185.95::numeric),
  ('VAC-BH021-d', 'Herstellen betonschade met een PCC-mortel (handmatig ontroesten St2) 1.000-1.500 cm3', 'st', 'Technische reparaties', 'hoog', 220.27::numeric, 58.3::numeric, 291.49::numeric),
  ('VAC-BH031-a', 'Herstellen betonschade met een PCC-mortel (stralen Sa 21⁄2) < 100 cm3', 'st', 'Constructieve reparaties', 'hoog', 73.06::numeric, 19.34::numeric, 96.68::numeric),
  ('VAC-BH031-b', 'Herstellen betonschade met een PCC-mortel (stralen Sa 21⁄2) 100-500 cm3', 'st', 'Constructieve reparaties', 'hoog', 120.71::numeric, 31.95::numeric, 159.74::numeric),
  ('VAC-BH031-c', 'Herstellen betonschade met een PCC-mortel (stralen Sa 21⁄2) 500-1.000 cm3', 'st', 'Constructieve reparaties', 'hoog', 207.62::numeric, 54.95::numeric, 274.75::numeric),
  ('VAC-BH031-d', 'Herstellen betonschade met een PCC-mortel (stralen Sa 21⁄2) 1.000-1.500 cm3', 'st', 'Constructieve reparaties', 'hoog', 258.41::numeric, 68.39::numeric, 341.96::numeric)
), t as (
  select r.*, r.minuten / 60 as uren,
    r.naam || chr(10)
      || 'VAC-verrekenprijs 2025: EUR ' || replace(to_char(r.vac_prijs, 'FM9999990.00'), '.', ',') || ' per ' || r.eenheid
      || ' (excl. btw), onderdeel Beton — ' || r.groep || '.' || chr(10)
      || 'Opbouw uit het VAC-blad: ' || replace(to_char(r.minuten, 'FM9999990.00'), '.', ',') || ' min arbeid (loonkostendeel bij EUR 39,70 per uur) en EUR '
      || replace(to_char(r.materiaal, 'FM9999990.00'), '.', ',') || ' materiaal (20% van de verrekenprijs).' as descr,
    'Tijdnorm ' || replace(to_char(r.minuten, 'FM9999990.00'), '.', ',') || ' min, uit het loonkostendeel van de VAC-verrekenprijs.' as tijd
  from r
), ins as (
  insert into public.paint_items (family_id, treatment_id, item_code, onderdeel, type, full_name, description, default_unit, groep, btw_tarief, marge_pct, source, active)
  select '00000000-0000-0000-0000-000000000001', '2d1663f5-7c81-505b-be32-6bff8ae4f889', t.code, 'Betonherstel', 'activiteit', t.naam, t.descr, t.eenheid, t.groep, t.btw, 30, 'VAC verrekenprijzen', true
  from t returning id, item_code
), arbeid as (
  insert into public.paint_labor_norms (item_id, treatment_id, source_code, unit, hours_per_unit, hour_rate, cost_per_unit, uurtarief_label, description, active)
  select ins.id, '2d1663f5-7c81-505b-be32-6bff8ae4f889', t.code, 'uur', round(t.uren, 6), 48, round(round(t.uren, 6) * 48, 4), 'Arbeid timmerman', t.tijd, true
  from ins join t on t.code = ins.item_code
)
insert into public.paint_material_norms (item_id, treatment_id, source_code, material_name, unit, quantity_per_unit, unit_price, cost_per_unit, norm_type, active)
select ins.id, '2d1663f5-7c81-505b-be32-6bff8ae4f889', t.code, 'Materiaal', 'post', 1, t.materiaal, t.materiaal, 'materiaal', true
from ins join t on t.code = ins.item_code;
