-- ============================================================
-- SEED DATA - Demo gegevens voor testen
-- BELANGRIJK: Voer dit ALLEEN uit in een development/demo omgeving
-- ============================================================

INSERT INTO houtrotherstel.standard_repairs
  (code, name, category, description, unit, labor_hours, labor_rate, material_cost, sale_price, active, price_date, version, notes)
VALUES
('EP-K-001', 'Epoxyherstel klein (< 50cm²)', 'Epoxyherstel klein',
  'Herstellen van houtrotherstel met epoxysysteem voor kleine oppervlakken tot 50cm². Inclusief voorbereiding, primer, vulhars en afwerking.',
  'st', 1.5, 65.00, 18.50, 185.00, true, '2024-01-01', '1.2',
  'Maximaal 2 lagen epoxy. Inclusief schilderklaar opleveren.'),

('EP-M-001', 'Epoxyherstel middel (50-200cm²)', 'Epoxyherstel middel',
  'Herstellen van houtrotherstel met epoxysysteem voor middelgrote oppervlakken 50-200cm². Inclusief voorbereiding, primer, vulhars en afwerking.',
  'st', 2.5, 65.00, 35.00, 285.00, true, '2024-01-01', '1.2',
  'Maximaal 3 lagen epoxy. Inclusief schilderklaar opleveren.'),

('EP-G-001', 'Epoxyherstel groot (> 200cm²)', 'Epoxyherstel groot',
  'Herstellen van houtrotherstel met epoxysysteem voor grote oppervlakken groter dan 200cm². Inclusief voorbereiding, primer, vulhars en afwerking.',
  'st', 4.0, 65.00, 65.00, 455.00, true, '2024-01-01', '1.2',
  'Meer dan 3 lagen mogelijk. Inclusief schilderklaar opleveren.'),

('DV-DOR-001', 'Deelvervanging dorpel', 'Deelvervanging dorpel',
  'Gedeeltelijk vervangen van een aangetaste dorpel. Inclusief demontage, levering en plaatsing nieuw hout, naad- en aansluitwerk.',
  'st', 3.0, 65.00, 85.00, 380.00, true, '2024-01-01', '1.1',
  'Hout kwaliteit Meranti of gelijkwaardig. Kleur op te geven.'),

('DV-STI-001', 'Deelvervanging stijl', 'Deelvervanging stijl',
  'Gedeeltelijk vervangen van een aangetaste stijl. Inclusief demontage, levering en plaatsing nieuw hout, naad- en aansluitwerk.',
  'st', 2.5, 65.00, 75.00, 325.00, true, '2024-01-01', '1.1',
  'Hout kwaliteit Meranti of gelijkwaardig.'),

('DV-KOZ-001', 'Deelvervanging kozijnhout', 'Deelvervanging kozijnhout',
  'Gedeeltelijk vervangen van aangetast kozijnhout. Inclusief demontage, levering en plaatsing nieuw hout.',
  'st', 3.5, 65.00, 95.00, 430.00, true, '2024-01-01', '1.0', NULL),

('VRV-GLA-001', 'Glaslat vervangen', 'Glaslat vervangen',
  'Verwijderen en vervangen van aangetaste glaslat. Inclusief kitten en schilderklaar opleveren.',
  'st', 0.75, 65.00, 12.00, 95.00, true, '2024-01-01', '1.0',
  'Prijs per glaslat. Standaard lengte tot 2m.'),

('VRV-NEU-001', 'Neuslat vervangen', 'Neuslat vervangen',
  'Verwijderen en vervangen van aangetaste neuslat. Inclusief kitten en schilderklaar opleveren.',
  'st', 1.0, 65.00, 18.00, 120.00, true, '2024-01-01', '1.0', NULL),

('VRV-OND-001', 'Onderdorpel herstel', 'Onderdorpel herstel',
  'Herstel of vervanging van onderdorpel. Inclusief demontage, levering materiaal, plaatsing en kitten.',
  'st', 2.0, 65.00, 55.00, 255.00, true, '2024-01-01', '1.1', NULL),

('KIT-001', 'Kit- en aansluitwerk', 'Kit- en aansluitwerk',
  'Verwijderen oude kit, reinigen voeg en aanbrengen nieuwe elastische kit. Per strekkende meter.',
  'm1', 0.25, 65.00, 4.50, 38.00, true, '2024-01-01', '1.0',
  'Prijs per strekkende meter. Kit kleur nader te bepalen.');

-- Materialen per standaard reparatie
INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Epoxy primer', 0.1, 'l', 45.00 FROM houtrotherstel.standard_repairs WHERE code = 'EP-K-001';
INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Epoxy vulhars', 0.15, 'kg', 55.00 FROM houtrotherstel.standard_repairs WHERE code = 'EP-K-001';
INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Schuurpapier', 1, 'st', 2.50 FROM houtrotherstel.standard_repairs WHERE code = 'EP-K-001';

INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Epoxy primer', 0.2, 'l', 45.00 FROM houtrotherstel.standard_repairs WHERE code = 'EP-M-001';
INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Epoxy vulhars', 0.4, 'kg', 55.00 FROM houtrotherstel.standard_repairs WHERE code = 'EP-M-001';
INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Schuurpapier', 2, 'st', 2.50 FROM houtrotherstel.standard_repairs WHERE code = 'EP-M-001';

INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Glaslat hout', 2.0, 'm1', 3.50 FROM houtrotherstel.standard_repairs WHERE code = 'VRV-GLA-001';
INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Kit elastisch', 0.1, 'st', 8.00 FROM houtrotherstel.standard_repairs WHERE code = 'VRV-GLA-001';
INSERT INTO houtrotherstel.standard_repair_materials (standard_repair_id, material_name, quantity, unit, unit_cost)
SELECT id, 'Glazen spijkers', 10, 'st', 0.10 FROM houtrotherstel.standard_repairs WHERE code = 'VRV-GLA-001';

INSERT INTO houtrotherstel.projects (
  project_number, name, client_name, address, postal_code, city,
  start_date, end_date, status, description, contact_name, contact_phone, contact_email
) VALUES
('P-2024-001', 'Renovatie Parkweg', 'Woningcorporatie De Goede Woning',
  'Parkweg 1-48', '2700 AB', 'Zoetermeer',
  '2024-03-01', '2024-09-30', 'actief',
  'Groot onderhoud aan 24 woningen in complex Parkweg. Houtrotherstel kozijnen, deuren en boeidelen.',
  'Jan de Vries', '070-1234567', 'j.devries@degoedewoning.nl'),

('P-2024-002', 'Onderhoud Bloemstraat', 'VvE Bloemstraat 10-24',
  'Bloemstraat 10-24', '2600 BC', 'Delft',
  '2024-05-01', '2024-07-31', 'actief',
  'Preventief onderhoud 8 appartementen. Focus op kozijnen voorgevel.',
  'Mw. Pietersen', '015-9876543', 'vve@bloemstraat.nl'),

('P-2023-015', 'Herstelwerk Kastanjeplein', 'Particulier eigenaar',
  'Kastanjeplein 3-5', '2288 GH', 'Rijswijk',
  '2023-09-01', '2023-12-31', 'afgerond',
  'Herstelwerkzaamheden houtrotherstel 2 panden. Afgerond december 2023.',
  'Dhr. Bakker', '070-5556789', 'bakker@email.nl'),

('P-2024-003', 'Groot onderhoud Wilhelminapark', 'Gemeente Rotterdam - Vastgoed',
  'Wilhelminapark 1-20', '3012 JE', 'Rotterdam',
  '2024-06-01', '2025-02-28', 'actief',
  'Groot onderhoud historisch complex. Meerdere blokken, gefaseerd uitvoeren.',
  'Ing. Smit', '010-4001234', 'vastgoed@rotterdam.nl'),

('P-2024-004', 'Spoedopdracht Kerkstraat', 'Woningcorporatie Havenwonen',
  'Kerkstraat 45', '3011 GC', 'Rotterdam',
  '2024-07-15', '2024-08-15', 'concept',
  'Spoedopdracht ernstig houtrotherstel. Nader in te plannen.',
  'Mw. Van Dam', '010-7654321', 'vdam@havenwonen.nl');
