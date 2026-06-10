import type {
  Project, Deelproject, Locatie, Element, Activiteit,
  CalculatieLijn, Scenario, BibliotheekActiviteit,
  Groep, Calculatieregel, Componentregel,
} from './types'

// ─── Mock bibliotheek ─────────────────────────────────────────────────────────

export const mockBibliotheek: BibliotheekActiviteit[] = [
  // SCHILDERWERK
  {
    id: 'bib-001', code: 'SCH-001', naam: 'Schilderen 1 laag dekkend',
    discipline: 'schilderwerk', eenheid: 'm²', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-001a', activiteit_id: 'bib-001', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid_per_eenheid: 0.10, eenheid: 'uur', eenheidsprijs: 58.00, normtijd_per_eenheid: 0.10, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-001b', activiteit_id: 'bib-001', lijn_type: 'materiaal', omschrijving: 'Dekkende lak buiten', hoeveelheid_per_eenheid: 0.10, eenheid: 'ltr', eenheidsprijs: 22.80, verliesfactor: 1.05, volgorde: 2 },
    ],
  },
  {
    id: 'bib-002', code: 'SCH-002', naam: 'Schilderen 2-laags dekkend',
    discipline: 'schilderwerk', eenheid: 'm²', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-002a', activiteit_id: 'bib-002', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid_per_eenheid: 0.22, eenheid: 'uur', eenheidsprijs: 58.00, normtijd_per_eenheid: 0.22, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-002b', activiteit_id: 'bib-002', lijn_type: 'materiaal', omschrijving: 'Grondverf alkyd', hoeveelheid_per_eenheid: 0.08, eenheid: 'ltr', eenheidsprijs: 15.50, verliesfactor: 1.05, volgorde: 2 },
      { id: 'br-002c', activiteit_id: 'bib-002', lijn_type: 'materiaal', omschrijving: 'Dekkende lak buiten', hoeveelheid_per_eenheid: 0.20, eenheid: 'ltr', eenheidsprijs: 22.80, verliesfactor: 1.05, volgorde: 3 },
    ],
  },
  {
    id: 'bib-003', code: 'SCH-003', naam: 'Kozijn schilderen compleet (per kozijn)',
    discipline: 'schilderwerk', eenheid: 'st', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-003a', activiteit_id: 'bib-003', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid_per_eenheid: 1.5, eenheid: 'uur', eenheidsprijs: 58.00, normtijd_per_eenheid: 1.5, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-003b', activiteit_id: 'bib-003', lijn_type: 'materiaal', omschrijving: 'Grondverf alkyd', hoeveelheid_per_eenheid: 0.3, eenheid: 'ltr', eenheidsprijs: 15.50, verliesfactor: 1.0, volgorde: 2 },
      { id: 'br-003c', activiteit_id: 'bib-003', lijn_type: 'materiaal', omschrijving: 'Dekkende lak buiten', hoeveelheid_per_eenheid: 0.6, eenheid: 'ltr', eenheidsprijs: 22.80, verliesfactor: 1.0, volgorde: 3 },
    ],
  },
  {
    id: 'bib-004', code: 'SCH-004', naam: 'Reinigen en ontvetten',
    discipline: 'schilderwerk', eenheid: 'm²', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-004a', activiteit_id: 'bib-004', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid_per_eenheid: 0.05, eenheid: 'uur', eenheidsprijs: 58.00, normtijd_per_eenheid: 0.05, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-004b', activiteit_id: 'bib-004', lijn_type: 'materiaal', omschrijving: 'Reinigingsmiddel', hoeveelheid_per_eenheid: 0.02, eenheid: 'ltr', eenheidsprijs: 8.50, verliesfactor: 1.0, volgorde: 2 },
    ],
  },
  {
    id: 'bib-005', code: 'SCH-005', naam: 'Schuren en voorbehandelen',
    discipline: 'schilderwerk', eenheid: 'm²', is_recept: false, is_actief: true,
    regels: [
      { id: 'br-005a', activiteit_id: 'bib-005', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid_per_eenheid: 0.08, eenheid: 'uur', eenheidsprijs: 58.00, normtijd_per_eenheid: 0.08, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-005b', activiteit_id: 'bib-005', lijn_type: 'materiaal', omschrijving: 'Schuurpapier P80/120', hoeveelheid_per_eenheid: 0.05, eenheid: 'st', eenheidsprijs: 3.20, verliesfactor: 1.0, volgorde: 2 },
    ],
  },
  // HOUTROTHERSTEL
  {
    id: 'bib-010', code: 'HRT-001', naam: 'Houtrotherstel epoxy',
    discipline: 'schilderwerk', eenheid: 'st', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-010a', activiteit_id: 'bib-010', lijn_type: 'arbeid', omschrijving: 'Timmerman', hoeveelheid_per_eenheid: 0.75, eenheid: 'uur', eenheidsprijs: 62.00, normtijd_per_eenheid: 0.75, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-010b', activiteit_id: 'bib-010', lijn_type: 'materiaal', omschrijving: 'Epoxy set incl. kit', hoeveelheid_per_eenheid: 1.0, eenheid: 'set', eenheidsprijs: 24.50, verliesfactor: 1.0, volgorde: 2 },
    ],
  },
  {
    id: 'bib-011', code: 'HRT-002', naam: 'Houtrotherstel deelvervanging',
    discipline: 'bouwkundig', eenheid: 'm¹', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-011a', activiteit_id: 'bib-011', lijn_type: 'arbeid', omschrijving: 'Timmerman', hoeveelheid_per_eenheid: 1.5, eenheid: 'uur', eenheidsprijs: 62.00, normtijd_per_eenheid: 1.5, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-011b', activiteit_id: 'bib-011', lijn_type: 'materiaal', omschrijving: 'Meranti lat 38x68', hoeveelheid_per_eenheid: 1.0, eenheid: 'm¹', eenheidsprijs: 8.20, verliesfactor: 1.1, volgorde: 2 },
      { id: 'br-011c', activiteit_id: 'bib-011', lijn_type: 'materiaal', omschrijving: 'Kit + schroeven', hoeveelheid_per_eenheid: 0.5, eenheid: 'set', eenheidsprijs: 4.50, verliesfactor: 1.0, volgorde: 3 },
    ],
  },
  {
    id: 'bib-012', code: 'HRT-003', naam: 'Houtrotherstel lamineren',
    discipline: 'bouwkundig', eenheid: 'st', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-012a', activiteit_id: 'bib-012', lijn_type: 'arbeid', omschrijving: 'Timmerman', hoeveelheid_per_eenheid: 1.25, eenheid: 'uur', eenheidsprijs: 62.00, normtijd_per_eenheid: 1.25, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-012b', activiteit_id: 'bib-012', lijn_type: 'materiaal', omschrijving: 'Lamineer set glasvezel', hoeveelheid_per_eenheid: 1.0, eenheid: 'set', eenheidsprijs: 35.00, verliesfactor: 1.0, volgorde: 2 },
    ],
  },
  // BOUWKUNDIG
  {
    id: 'bib-020', code: 'BOU-001', naam: 'Voegwerk herstellen',
    discipline: 'bouwkundig', eenheid: 'm¹', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-020a', activiteit_id: 'bib-020', lijn_type: 'arbeid', omschrijving: 'Metselaar', hoeveelheid_per_eenheid: 0.12, eenheid: 'uur', eenheidsprijs: 65.00, normtijd_per_eenheid: 0.12, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-020b', activiteit_id: 'bib-020', lijn_type: 'materiaal', omschrijving: 'Voegmortel', hoeveelheid_per_eenheid: 0.05, eenheid: 'kg', eenheidsprijs: 2.80, verliesfactor: 1.1, volgorde: 2 },
    ],
  },
  {
    id: 'bib-021', code: 'BOU-002', naam: 'Kitwerk rondom kozijn',
    discipline: 'bouwkundig', eenheid: 'm¹', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-021a', activiteit_id: 'bib-021', lijn_type: 'arbeid', omschrijving: 'Schilder/algemeen', hoeveelheid_per_eenheid: 0.06, eenheid: 'uur', eenheidsprijs: 58.00, normtijd_per_eenheid: 0.06, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-021b', activiteit_id: 'bib-021', lijn_type: 'materiaal', omschrijving: 'Kitpatroon buiten', hoeveelheid_per_eenheid: 0.25, eenheid: 'st', eenheidsprijs: 6.50, verliesfactor: 1.0, volgorde: 2 },
    ],
  },
  // DAKWERK
  {
    id: 'bib-030', code: 'DAK-001', naam: 'Dakreparatie bitumen (< 0.5m²)',
    discipline: 'dakwerk', eenheid: 'st', is_recept: true, is_actief: true,
    regels: [
      { id: 'br-030a', activiteit_id: 'bib-030', lijn_type: 'arbeid', omschrijving: 'Dakdekker', hoeveelheid_per_eenheid: 0.75, eenheid: 'uur', eenheidsprijs: 68.00, normtijd_per_eenheid: 0.75, verliesfactor: 1.0, volgorde: 1 },
      { id: 'br-030b', activiteit_id: 'bib-030', lijn_type: 'materiaal', omschrijving: 'Bitumenfolie reparatie', hoeveelheid_per_eenheid: 0.5, eenheid: 'm²', eenheidsprijs: 28.00, verliesfactor: 1.2, volgorde: 2 },
    ],
  },
  {
    id: 'bib-031', code: 'DAK-002', naam: 'Dakgoot reinigen',
    discipline: 'dakwerk', eenheid: 'm¹', is_recept: false, is_actief: true,
    regels: [
      { id: 'br-031a', activiteit_id: 'bib-031', lijn_type: 'arbeid', omschrijving: 'Dakdekker', hoeveelheid_per_eenheid: 0.08, eenheid: 'uur', eenheidsprijs: 68.00, normtijd_per_eenheid: 0.08, verliesfactor: 1.0, volgorde: 1 },
    ],
  },
]

// ─── Mock project data ────────────────────────────────────────────────────────

export const mockProjecten: Project[] = [
  {
    id: 'proj-001',
    code: 'EVR-2024-0001',
    naam: 'Buitenschilderwerk VvE Eikenlaan',
    opdrachtgever: 'VvE Eikenlaan',
    opdrachtgever_contactpersoon: 'Jan de Vries',
    opdrachtgever_email: 'jdevries@vve-eikenlaan.nl',
    adres: 'Eikenlaan 1-48, Zoetermeer',
    discipline: 'schilderwerk',
    status: 'offerte',
    eigenaar: 'Kees Everts',
    aangemaakt_op: '2024-02-15T10:00:00Z',
    bijgewerkt_op: '2024-02-15T10:00:00Z',
  },
  {
    id: 'proj-002',
    code: 'EVR-2024-0002',
    naam: 'Dakdekking Woonzorgcentrum De Linde',
    opdrachtgever: 'Wozoco De Linde BV',
    opdrachtgever_contactpersoon: 'M. Bakker',
    adres: 'Lindestraat 22, Den Haag',
    discipline: 'dakwerk',
    status: 'gewonnen',
    eigenaar: 'Kees Everts',
    aangemaakt_op: '2024-01-20T09:00:00Z',
    bijgewerkt_op: '2024-01-25T14:00:00Z',
  },
  {
    id: 'proj-003',
    code: 'EVR-2024-0003',
    naam: 'Houtrot kozijnen Blok B - Woonstichting HWH',
    opdrachtgever: 'Woonstichting HWH',
    opdrachtgever_contactpersoon: 'Peter Hofman',
    adres: 'Bergweg 50-80, Delft',
    discipline: 'bouwkundig',
    status: 'concept',
    eigenaar: 'Kees Everts',
    aangemaakt_op: '2024-03-01T08:00:00Z',
    bijgewerkt_op: '2024-03-01T08:00:00Z',
  },
]

export const mockDeelprojecten: Deelproject[] = [
  { id: 'dp-001', project_id: 'proj-001', naam: 'Buitenschilderwerk', volgorde: 1 },
  { id: 'dp-002', project_id: 'proj-001', naam: 'Houtrotherstel', volgorde: 2 },
]

export const mockLocaties: Locatie[] = [
  { id: 'loc-001', deelproject_id: 'dp-001', naam: 'Blok A - Cornelisstraat 1-12', volgorde: 1 },
  { id: 'loc-002', deelproject_id: 'dp-001', naam: 'Blok B - Cornelisstraat 14-24', volgorde: 2 },
  { id: 'loc-003', deelproject_id: 'dp-002', naam: 'Blok A', volgorde: 1 },
]

export const mockElementen: Element[] = [
  { id: 'elm-001', locatie_id: 'loc-001', naam: 'Kozijnen BG voor (12 st)', element_type: 'kozijn', volgorde: 1 },
  { id: 'elm-002', locatie_id: 'loc-001', naam: 'Kozijnen 1e verd. (12 st)', element_type: 'kozijn', volgorde: 2 },
  { id: 'elm-003', locatie_id: 'loc-001', naam: 'Gevelbekleding (180 m²)', element_type: 'gevel', volgorde: 3 },
  { id: 'elm-004', locatie_id: 'loc-003', naam: 'Kozijnen BG - houtrot (8 st)', element_type: 'kozijn', volgorde: 1 },
]

export const mockScenarios: Scenario[] = [
  {
    id: 'sc-001',
    project_id: 'proj-001',
    naam: 'Basisvariant',
    is_standaard: true,
    opslag_algemene_kosten: 8,
    opslag_winst_risico: 10,
    opslag_overhead: 0,
  },
  {
    id: 'sc-002',
    project_id: 'proj-001',
    naam: 'Duurzame variant',
    is_standaard: false,
    opslag_algemene_kosten: 8,
    opslag_winst_risico: 12,
    opslag_overhead: 0,
  },
]

export const mockActiviteiten: Activiteit[] = [
  { id: 'act-001', element_id: 'elm-001', scenario_id: 'sc-001', naam: 'Schilderen 2-laags dekkend', eenheid: 'm²', hoeveelheid: 36, volgorde: 1 },
  { id: 'act-002', element_id: 'elm-001', scenario_id: 'sc-001', naam: 'Reinigen en ontvetten', eenheid: 'm²', hoeveelheid: 36, volgorde: 2 },
  { id: 'act-003', element_id: 'elm-001', scenario_id: 'sc-001', naam: 'Schuren en voorbehandelen', eenheid: 'm²', hoeveelheid: 36, volgorde: 3 },
]

export const mockLijnen: CalculatieLijn[] = [
  { id: 'lijn-001', activiteit_id: 'act-001', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid: 0.22, eenheid: 'uur', eenheidsprijs: 58.00, normtijd: 0.22, verliesfactor: 1.0 },
  { id: 'lijn-002', activiteit_id: 'act-001', lijn_type: 'materiaal', omschrijving: 'Grondverf alkyd', hoeveelheid: 0.08, eenheid: 'ltr', eenheidsprijs: 15.50, verliesfactor: 1.05 },
  { id: 'lijn-003', activiteit_id: 'act-001', lijn_type: 'materiaal', omschrijving: 'Dekkende lak buiten', hoeveelheid: 0.20, eenheid: 'ltr', eenheidsprijs: 22.80, verliesfactor: 1.05 },
  { id: 'lijn-004', activiteit_id: 'act-002', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid: 0.05, eenheid: 'uur', eenheidsprijs: 58.00, verliesfactor: 1.0 },
  { id: 'lijn-005', activiteit_id: 'act-002', lijn_type: 'materiaal', omschrijving: 'Reinigingsmiddel', hoeveelheid: 0.02, eenheid: 'ltr', eenheidsprijs: 8.50, verliesfactor: 1.0 },
  { id: 'lijn-006', activiteit_id: 'act-003', lijn_type: 'arbeid', omschrijving: 'Schilder', hoeveelheid: 0.08, eenheid: 'uur', eenheidsprijs: 58.00, verliesfactor: 1.0 },
]

// ─── Mock groepen (nieuwe structuur — scenario sc-001) ────────────────────────
// Buitenschilderwerk VvE Eikenlaan
//
// 1  Schilderwerk buitenzijde
//   1.1  Gevels en kozijnen
//     1.1.1  Voorgevel
//     1.1.2  Achtergevel
//   1.2  Dakranden
// 2  Bouwkundig onderhoud
//   2.1  Houtwerk

export const mockGroepen: Groep[] = [
  // Niveau 1
  { id: 'grp-001', scenario_id: 'sc-001', parent_id: null,    naam: 'Schilderwerk buitenzijde', niveau: 1, volgorde: 1 },
  { id: 'grp-006', scenario_id: 'sc-001', parent_id: null,    naam: 'Bouwkundig onderhoud',     niveau: 1, volgorde: 2 },
  // Niveau 2
  { id: 'grp-002', scenario_id: 'sc-001', parent_id: 'grp-001', naam: 'Gevels en kozijnen', niveau: 2, volgorde: 1 },
  { id: 'grp-005', scenario_id: 'sc-001', parent_id: 'grp-001', naam: 'Dakranden',          niveau: 2, volgorde: 2 },
  { id: 'grp-007', scenario_id: 'sc-001', parent_id: 'grp-006', naam: 'Houtwerk',           niveau: 2, volgorde: 1 },
  // Niveau 3
  { id: 'grp-003', scenario_id: 'sc-001', parent_id: 'grp-002', naam: 'Voorgevel',   niveau: 3, volgorde: 1 },
  { id: 'grp-004', scenario_id: 'sc-001', parent_id: 'grp-002', naam: 'Achtergevel', niveau: 3, volgorde: 2 },
]

export const mockCalculatieregels: Calculatieregel[] = [
  // 1.1.1 Voorgevel
  { id: 'crg-001', groep_id: 'grp-003', omschrijving: 'Kozijnen schilderen 2-laags', hoeveelheid: 36, eenheid: 'st', volgorde: 1 },
  { id: 'crg-002', groep_id: 'grp-003', omschrijving: 'Reinigen en ontvetten',       hoeveelheid: 36, eenheid: 'st', volgorde: 2 },
  // 1.1.2 Achtergevel
  { id: 'crg-003', groep_id: 'grp-004', omschrijving: 'Kozijnen schilderen 2-laags', hoeveelheid: 24, eenheid: 'st', volgorde: 1 },
  // 1.2 Dakranden
  { id: 'crg-004', groep_id: 'grp-005', omschrijving: 'Schilderen dakrand',          hoeveelheid: 80, eenheid: 'm¹', volgorde: 1 },
  // 2 Bouwkundig — direct op niveau 1
  { id: 'crg-005', groep_id: 'grp-006', omschrijving: 'Schoonmaken en inspecteren',  hoeveelheid:  1, eenheid: 'st', volgorde: 1 },
  // 2.1 Houtwerk
  { id: 'crg-006', groep_id: 'grp-007', omschrijving: 'Houtrot kozijnen vervangen',  hoeveelheid:  6, eenheid: 'st', volgorde: 1 },
]

export const mockComponentregels: Componentregel[] = [
  // crg-001: Kozijnen schilderen 2-laags (36 st)
  { id: 'cmp-001', calculatieregel_id: 'crg-001', type: 'arbeid',   norm_hoeveelheid: 0.25, tarief: 58.00 },
  { id: 'cmp-002', calculatieregel_id: 'crg-001', type: 'materieel', norm_hoeveelheid: 0.08, tarief: 22.00 },
  // crg-002: Reinigen en ontvetten (36 st)
  { id: 'cmp-003', calculatieregel_id: 'crg-002', type: 'arbeid',   norm_hoeveelheid: 0.08, tarief: 58.00 },
  // crg-003: Kozijnen schilderen 2-laags (24 st)
  { id: 'cmp-004', calculatieregel_id: 'crg-003', type: 'arbeid',   norm_hoeveelheid: 0.25, tarief: 58.00 },
  { id: 'cmp-005', calculatieregel_id: 'crg-003', type: 'materieel', norm_hoeveelheid: 0.08, tarief: 22.00 },
  // crg-004: Dakrand (80 m¹)
  { id: 'cmp-006', calculatieregel_id: 'crg-004', type: 'arbeid',   norm_hoeveelheid: 0.30, tarief: 42.00 },
  { id: 'cmp-007', calculatieregel_id: 'crg-004', type: 'materieel', norm_hoeveelheid: 0.10, tarief: 8.50 },
  // crg-005: Schoonmaken (1 st)
  { id: 'cmp-008', calculatieregel_id: 'crg-005', type: 'arbeid',   norm_hoeveelheid: 4.00, tarief: 58.00 },
  // crg-006: Houtrot (6 st) — onderaanneming
  { id: 'cmp-009', calculatieregel_id: 'crg-006', type: 'onderaanneming', norm_hoeveelheid: 1.00, tarief: 480.00 },
]

export const mockGebruiker = {
  id: 'user-001',
  naam: 'Kees Everts',
  email: 'k.everts@evertsonline.nl',
  rol: 'admin' as const,
}
