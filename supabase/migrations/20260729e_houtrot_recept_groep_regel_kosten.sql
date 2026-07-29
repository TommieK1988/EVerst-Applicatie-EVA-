-- (1) Groepslabel op recepten zodat de houtrot-app een tweetraps keuze kan tonen
-- (soort → variant). Alleen de houtrot-recepten krijgen een groep; recepten zonder
-- groep verschijnen niet in de houtrot-keuze.
--
-- Toegepast op productie via de Supabase MCP op 2026-07-29.
alter table public.paint_items add column if not exists groep text;

update public.paint_items set groep = 'Epoxyherstel'
  where item_code in ('EP-K-001','EP-M-001','EP-G-001');
update public.paint_items set groep = 'Deelvervanging'
  where item_code in ('DV-DOR-001','DV-KOZ-001','DV-STI-001');
update public.paint_items set groep = 'Vervangen'
  where item_code in ('VRV-GLA-001','VRV-NEU-001','VRV-OND-001');
update public.paint_items set groep = 'Kit- en aansluitwerk'
  where item_code in ('KIT-001');

-- (2) Arbeids- en materiaalkosten per stuk op de werkzaamheden-regel, zodat het
-- desktop-overzicht uren/arbeid/materiaal kan tonen (productie vs. geboekte kosten).
alter table houtrotherstel.repair_registration_lines
  add column if not exists labor_cost_snapshot numeric(12,2);
alter table houtrotherstel.repair_registration_lines
  add column if not exists material_cost_snapshot numeric(12,2);

notify pgrst, 'reload schema';
