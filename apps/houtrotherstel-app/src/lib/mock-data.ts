// ============================================================
// MOCK DATA - tijdelijk, vervangt Supabase totdat DB is gekoppeld
// ============================================================

import type { Profile, Project, RepairRegistration, StandardRepair, Projectdeel, Locatie, Registratie, Reparatie } from './types'

export const mockProfile: Profile = {
  id: 'mock-user-1',
  full_name: 'Admin Gebruiker',
  email: 'admin@houtrotherstel.nl',
  role: 'admin',
  active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

export const mockProjecten: Project[] = [
  {
    id: 'p-1',
    project_number: 'P-2024-001',
    name: 'Renovatie Parkweg',
    client_name: 'Woningcorporatie De Goede Woning',
    address: 'Parkweg 1-48',
    postal_code: '2700 AB',
    city: 'Zoetermeer',
    start_date: '2024-03-01',
    end_date: '2024-09-30',
    status: 'onderhanden',
    description: 'Groot onderhoud aan 24 woningen. Houtrotherstel kozijnen, deuren en boeidelen.',
    contact_name: 'Jan de Vries',
    contact_phone: '070-1234567',
    contact_email: 'j.devries@degoedewoning.nl',
    notes: null,
    photo_url: null,
    created_by: 'mock-user-1',
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'p-2',
    project_number: 'P-2024-002',
    name: 'Onderhoud Bloemstraat',
    client_name: 'VvE Bloemstraat 10-24',
    address: 'Bloemstraat 10-24',
    postal_code: '2600 BC',
    city: 'Delft',
    start_date: '2024-05-01',
    end_date: '2024-07-31',
    status: 'onderhanden',
    description: 'Preventief onderhoud 8 appartementen. Focus op kozijnen voorgevel.',
    contact_name: 'Mw. Pietersen',
    contact_phone: '015-9876543',
    contact_email: 'vve@bloemstraat.nl',
    notes: null,
    photo_url: null,
    created_by: 'mock-user-1',
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'p-3',
    project_number: 'P-2023-015',
    name: 'Herstelwerk Kastanjeplein',
    client_name: 'Particulier eigenaar',
    address: 'Kastanjeplein 3-5',
    postal_code: '2288 GH',
    city: 'Rijswijk',
    start_date: '2023-09-01',
    end_date: '2023-12-31',
    status: 'afgerond',
    description: 'Herstelwerkzaamheden houtrotherstel 2 panden. Afgerond december 2023.',
    contact_name: 'Dhr. Bakker',
    contact_phone: '070-5556789',
    contact_email: 'bakker@email.nl',
    notes: null,
    photo_url: null,
    created_by: 'mock-user-1',
    created_at: '2023-08-01T00:00:00Z',
    updated_at: '2023-08-01T00:00:00Z',
  },
]

export const mockRegistraties: Registratie[] = [
  {
    id: 'reg-1', locatie_id: 'loc-1', projectdeel_id: 'gd-1', project_id: 'p-1',
    datum: '2024-03-15', medewerker: 'P. Jansen',
    omschrijving: 'Ernstig houtverlies onderdorpel kozijn, ca. 30x15cm. Langdurige vochtinwerking.',
    voor_foto: null, na_foto: null,
    status: 'geregistreerd',
    created_at: '2024-03-15T09:00:00Z', updated_at: '2024-03-20T00:00:00Z',
  },
  {
    id: 'reg-2', locatie_id: 'loc-2', projectdeel_id: 'gd-1', project_id: 'p-1',
    datum: '2024-03-16', medewerker: 'T. de Vries',
    omschrijving: 'Volledig aangetaste dorpel, vervanging noodzakelijk. Afstemmen met bewoner.',
    voor_foto: null, na_foto: null,
    status: 'geregistreerd',
    created_at: '2024-03-16T10:00:00Z', updated_at: '2024-03-16T10:00:00Z',
  },
  {
    id: 'reg-3', locatie_id: 'loc-3', projectdeel_id: 'gd-2', project_id: 'p-1',
    datum: '2024-03-18', medewerker: 'P. Jansen',
    omschrijving: 'Klein epoxyherstel kozijn hoek.',
    voor_foto: null, na_foto: null,
    status: 'geregistreerd',
    created_at: '2024-03-18T11:00:00Z', updated_at: '2024-03-18T11:00:00Z',
  },
  {
    id: 'reg-4', locatie_id: 'loc-4', projectdeel_id: 'gd-3', project_id: 'p-2',
    datum: '2024-05-10', medewerker: 'M. Bakker',
    omschrijving: 'Glaslat volledig verrot aan hoekverbinding.',
    voor_foto: null, na_foto: null,
    status: 'geregistreerd',
    created_at: '2024-05-10T08:00:00Z', updated_at: '2024-05-10T08:00:00Z',
  },
]

export const mockStandaardReparaties: StandardRepair[] = [
  {
    id: 'sr-1', code: 'EP-K-001', name: 'Epoxyherstel klein (< 50cm²)',
    extended_description: 'Herstellen van houtrotherstel met epoxysysteem voor kleine oppervlakken tot 50cm². Inclusief schuurwerk, primer en afwerklaag.',
    category: 'Epoxyherstel', description: 'Klein oppervlak < 50cm²',
    unit: 'st', labor_hours: 1.5, labor_rate: 65, labor_cost: 97.5,
    material_cost: 18.5, cost_price: 116, sale_price: 185, vat_percentage: 21, margin: 37.3,
    active: true, price_date: '2024-01-01', version: '1.2', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sr-2', code: 'EP-M-001', name: 'Epoxyherstel middel (50-200cm²)',
    extended_description: 'Herstellen van houtrotherstel met epoxysysteem voor middelgrote oppervlakken 50–200cm². Inclusief schuurwerk, primer en afwerklaag.',
    category: 'Epoxyherstel', description: 'Middelgroot oppervlak 50–200cm²',
    unit: 'st', labor_hours: 2.5, labor_rate: 65, labor_cost: 162.5,
    material_cost: 35, cost_price: 197.5, sale_price: 285, vat_percentage: 21, margin: 30.7,
    active: true, price_date: '2024-01-01', version: '1.2', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sr-3', code: 'EP-G-001', name: 'Epoxyherstel groot (> 200cm²)',
    extended_description: 'Herstellen van houtrotherstel met epoxysysteem voor grote oppervlakken boven 200cm². Inclusief schuurwerk, primer en afwerklaag.',
    category: 'Epoxyherstel', description: 'Groot oppervlak > 200cm²',
    unit: 'st', labor_hours: 4.0, labor_rate: 65, labor_cost: 260,
    material_cost: 65, cost_price: 325, sale_price: 455, vat_percentage: 21, margin: 28.6,
    active: true, price_date: '2024-01-01', version: '1.2', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sr-4', code: 'DV-DOR-001', name: 'Deelvervanging dorpel',
    extended_description: 'Gedeeltelijk vervangen van een aangetaste dorpel. Inclusief verwijdering, levering nieuw hout, montage en kit- en schilderwerk.',
    category: 'Deelvervanging', description: 'Dorpel gedeeltelijk',
    unit: 'st', labor_hours: 3.0, labor_rate: 65, labor_cost: 195,
    material_cost: 85, cost_price: 280, sale_price: 380, vat_percentage: 21, margin: 26.3,
    active: true, price_date: '2024-01-01', version: '1.1', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sr-5', code: 'DV-STI-001', name: 'Deelvervanging stijl',
    extended_description: 'Gedeeltelijk vervangen van een aangetaste stijl. Inclusief verwijdering, levering nieuw hout, montage en kit- en schilderwerk.',
    category: 'Deelvervanging', description: 'Stijl gedeeltelijk',
    unit: 'st', labor_hours: 2.5, labor_rate: 65, labor_cost: 162.5,
    material_cost: 75, cost_price: 237.5, sale_price: 325, vat_percentage: 21, margin: 26.9,
    active: true, price_date: '2024-01-01', version: '1.1', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sr-6', code: 'DV-KOZ-001', name: 'Deelvervanging kozijnhout',
    extended_description: 'Gedeeltelijk vervangen van aangetast kozijnhout. Inclusief verwijdering, levering nieuw hout, montage en kit- en schilderwerk.',
    category: 'Deelvervanging', description: 'Kozijnhout gedeeltelijk',
    unit: 'st', labor_hours: 3.5, labor_rate: 65, labor_cost: 227.5,
    material_cost: 95, cost_price: 322.5, sale_price: 430, vat_percentage: 21, margin: 25,
    active: true, price_date: '2024-01-01', version: '1.0', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sr-7', code: 'VRV-GLA-001', name: 'Glaslat vervangen',
    extended_description: 'Verwijderen en vervangen van aangetaste glaslat. Inclusief verwijdering, levering nieuwe glaslat en montage.',
    category: 'Vervangen', description: 'Glaslat',
    unit: 'st', labor_hours: 0.75, labor_rate: 65, labor_cost: 48.75,
    material_cost: 12, cost_price: 60.75, sale_price: 95, vat_percentage: 21, margin: 36.1,
    active: true, price_date: '2024-01-01', version: '1.0', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'sr-8', code: 'KIT-001', name: 'Kit- en aansluitwerk',
    extended_description: 'Verwijderen oude kit, reinigen voeg en aanbrengen nieuwe elastische kit. Per strekkende meter.',
    category: 'Kitwerk', description: 'Kit- en aansluitwerk per m1',
    unit: 'm1', labor_hours: 0.25, labor_rate: 65, labor_cost: 16.25,
    material_cost: 4.5, cost_price: 20.75, sale_price: 38, vat_percentage: 21, margin: 45.4,
    active: true, price_date: '2024-01-01', version: '1.0', notes: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
]

// ─── Projectdelen ─────────────────────────────────────────────────────────────

export const mockProjectdelen: Projectdeel[] = [
  {
    id: 'gd-1', project_id: 'p-1', naam: 'Voorgevel', volgorde: 1,
    omschrijving: 'Voorzijde pand, straatkant',
    created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'gd-2', project_id: 'p-1', naam: 'Achtergevel', volgorde: 2,
    omschrijving: 'Achterzijde richting tuin',
    created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'gd-3', project_id: 'p-2', naam: 'Voorgevel', volgorde: 1,
    omschrijving: null,
    created_at: '2024-05-01T00:00:00Z', updated_at: '2024-05-01T00:00:00Z',
  },
]

// ─── Locaties ─────────────────────────────────────────────────────────────────

export const mockLocaties: Locatie[] = [
  {
    id: 'loc-1', projectdeel_id: 'gd-1', project_id: 'p-1',
    naam: 'Kozijn woning 8, 1e verdieping links',
    omschrijving: null,
    created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'loc-2', projectdeel_id: 'gd-1', project_id: 'p-1',
    naam: 'Dorpel woning 8, 1e verdieping',
    omschrijving: null,
    created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'loc-3', projectdeel_id: 'gd-2', project_id: 'p-1',
    naam: 'Kozijn woning 12, 2e verdieping',
    omschrijving: null,
    created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z',
  },
  {
    id: 'loc-4', projectdeel_id: 'gd-3', project_id: 'p-2',
    naam: 'Glaslat appartement 10, begane grond',
    omschrijving: null,
    created_at: '2024-05-10T00:00:00Z', updated_at: '2024-05-10T00:00:00Z',
  },
]

// ─── Reparaties ───────────────────────────────────────────────────────────────

export const mockReparaties: Reparatie[] = [
  {
    id: 'rep-1', registratie_id: 'reg-1', locatie_id: 'loc-1', projectdeel_id: 'gd-1', project_id: 'p-1',
    omschrijving: 'Epoxyherstel onderzijde kozijn, ca. 30x15cm. Inclusief schilderklaar opleveren.',
    standaard_reparatie_id: 'sr-2',
    reparatie_naam: 'Epoxyherstel middel (50-200cm²)',
    reparatie_code: 'EP-M-001',
    sale_price_snapshot: 285,
    created_at: '2024-03-15T09:00:00Z', updated_at: '2024-03-20T00:00:00Z',
  },
  {
    id: 'rep-2', registratie_id: 'reg-2', locatie_id: 'loc-2', projectdeel_id: 'gd-1', project_id: 'p-1',
    omschrijving: 'Deelvervanging dorpel inclusief kit- en aansluitwerk. Afstemmen met bewoner voor toegang.',
    standaard_reparatie_id: 'sr-4',
    reparatie_naam: 'Deelvervanging dorpel',
    reparatie_code: 'DV-DOR-001',
    sale_price_snapshot: 380,
    created_at: '2024-03-16T10:00:00Z', updated_at: '2024-03-16T10:00:00Z',
  },
  {
    id: 'rep-3', registratie_id: 'reg-3', locatie_id: 'loc-3', projectdeel_id: 'gd-2', project_id: 'p-1',
    omschrijving: 'Klein epoxyherstel kozijn hoek.',
    standaard_reparatie_id: 'sr-1',
    reparatie_naam: 'Epoxyherstel klein (< 50cm²)',
    reparatie_code: 'EP-K-001',
    sale_price_snapshot: 185,
    created_at: '2024-03-18T11:00:00Z', updated_at: '2024-03-18T11:00:00Z',
  },
  {
    id: 'rep-4', registratie_id: 'reg-4', locatie_id: 'loc-4', projectdeel_id: 'gd-3', project_id: 'p-2',
    omschrijving: 'Glaslat volledig verrot aan hoekverbinding. Vervangen.',
    standaard_reparatie_id: 'sr-7',
    reparatie_naam: 'Glaslat vervangen',
    reparatie_code: 'VRV-GLA-001',
    sale_price_snapshot: 95,
    created_at: '2024-05-10T08:00:00Z', updated_at: '2024-05-10T08:00:00Z',
  },
]
