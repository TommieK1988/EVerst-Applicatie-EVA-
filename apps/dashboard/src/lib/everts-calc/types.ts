// ─── Enums & constanten ───────────────────────────────────────────────────────

export const DISCIPLINES = {
  schilderwerk: 'Schilderwerk',
  bouwkundig: 'Bouwkundig',
  dakwerk: 'Dakwerk',
  dagelijks_onderhoud: 'Dagelijks onderhoud',
  gemengd: 'Gemengd',
} as const

export const PROJECT_STATUSSEN = {
  aanvraag: 'Aanvraag',
  offerte:  'Offerte',
  opdracht: 'Opdracht',
} as const

export const ELEMENT_TYPES = {
  kozijn: 'Kozijn',
  gevel: 'Gevel',
  dakvlak: 'Dakvlak',
  vloer: 'Vloer',
  deur: 'Deur',
  dakgoot: 'Dakgoot',
  balkon: 'Balkon',
  overig: 'Overig',
} as const

export const LIJN_TYPES = {
  arbeid: 'Arbeid',
  materiaal: 'Materiaal',
  materieel: 'Materieel',
  onderaannemer: 'Onderaannemer',
} as const

export const HOUTROT_METHODES = {
  epoxy: 'Epoxy herstel',
  deelvervanging: 'Deelvervanging',
  lamineren: 'Lamineren (glasvezel)',
} as const

export const EENHEDEN = ['m²', 'm¹', 'st', 'uur', 'dag', 'm³', 'ltr', 'kg', 'set', 'STP', 'VRR'] as const
// Eenheid = de afkorting die op een calculatieregel wordt opgeslagen.
// Vrije string zodat zelf toegevoegde eenheden ook toegestaan zijn.
export type Eenheid = string

// Configureerbare eenheid: korte afkorting (getoond in het grid) + volledige omschrijving.
// De afkortingen 'STP' en 'VRR' zetten automatisch het Stelpost- resp. Verrekenbaar-vinkje aan.
export interface EenheidConfig {
  afkorting: string
  omschrijving: string
}

// ─── Kern datamodellen ────────────────────────────────────────────────────────

export interface Project {
  id: string
  code: string
  naam: string
  opdrachtgever: string
  opdrachtgever_contactpersoon?: string
  opdrachtgever_email?: string
  adres?: string
  discipline: keyof typeof DISCIPLINES
  status: keyof typeof PROJECT_STATUSSEN
  eigenaar: string
  aangemaakt_op: string
  bijgewerkt_op: string
  notities?: string
}

export interface Deelproject {
  id: string
  project_id: string
  naam: string
  volgorde: number
}

export interface Locatie {
  id: string
  deelproject_id: string
  naam: string
  adres?: string
  volgorde: number
}

export interface Element {
  id: string
  locatie_id: string
  naam: string
  element_type: keyof typeof ELEMENT_TYPES
  volgorde: number
  notities?: string
}

export interface Scenario {
  id: string
  project_id: string
  naam: string
  /** Offertenummer (OFT-YYYY-NNN, met -vN bij revisies) — gereserveerd bij aanmaken
   *  van de calculatie; de offerte die ervan gemaakt wordt neemt dit nummer over. */
  nummer?: string | null
  /** Familie-anker: id van de eerste calculatie (v1) in de versiereeks. Leeg =
   *  legacy/1-versie-familie (wordt behandeld als root = zichzelf). */
  versie_root_id?: string | null
  /** Versienummer binnen de familie (1 = origineel). Leeg = 1. */
  versie?: number
  /** Gezet bij verzenden van de offerte: de calculatie is dan onveranderbaar. */
  bevroren_op?: string | null
  is_standaard: boolean
  opslag_algemene_kosten: number   // percentage bijv. 8
  opslag_winst_risico: number      // percentage bijv. 10
  opslag_overhead: number          // percentage bijv. 0
  btw_pct_default?: number         // standaard te heffen BTW% voor nieuwe regels, bijv. 21
  btw_tarief_id_default?: string   // standaard BTW-tarief (btw_tarieven.id) voor nieuwe regels
  standaard_uurtarief?: number     // standaard uurtarief voor nieuwe arbeid-componenten
  betalingsconditie_id?: string | null
  algemene_voorwaarden_id?: string | null
  // Vrije offerte-teksten per calculatie. Winnen bij het aanmaken van de offerte;
  // leeg → terugval op het standaard offerte-sjabloon (quote_templates).
  voorwaarden_tekst?: string | null
  uitsluitingen_tekst?: string | null
  opmerkingen_tekst?: string | null
  /** Gezet wanneer deze calculatie de calculatie van een meerwerkregel is (i.p.v. een
   *  contractversie). Zo blijft het meerwerk in hetzelfde dossier-project maar apart
   *  herkenbaar (eigen blok in de versie-kiezer; offerte wordt als meerwerk gekoppeld). */
  meerwerk_regel_id?: string | null
}

export interface Activiteit {
  id: string
  element_id: string
  scenario_id: string
  naam: string
  eenheid: Eenheid
  hoeveelheid: number
  opslag_pct?: number       // opslag per activiteit (default: scenario AK + W&R)
  bibliotheek_activiteit_id?: string
  volgorde: number
  notities?: string
}

export interface CalculatieLijn {
  id: string
  activiteit_id: string
  lijn_type: keyof typeof LIJN_TYPES
  omschrijving: string
  hoeveelheid: number
  eenheid: Eenheid
  eenheidsprijs: number
  normtijd?: number       // uur/eenheid (alleen bij arbeid)
  verliesfactor: number   // 1.0 = geen verlies, 1.10 = 10% verlies
  btw_pct?: number        // BTW percentage, bijv. 21
}

// ─── Bibliotheek ──────────────────────────────────────────────────────────────

export interface BibliotheekActiviteit {
  id: string
  code: string
  naam: string
  discipline: keyof typeof DISCIPLINES | 'algemeen'
  eenheid: Eenheid
  omschrijving?: string
  is_recept: boolean
  is_actief: boolean
  regels: BibliotheekLijn[]
}

export interface BibliotheekLijn {
  id: string
  activiteit_id: string
  lijn_type: keyof typeof LIJN_TYPES
  omschrijving: string
  hoeveelheid_per_eenheid: number
  eenheid: Eenheid
  eenheidsprijs: number
  normtijd_per_eenheid?: number
  verliesfactor: number
  volgorde: number
}

// ─── Berekende totalen (niet opgeslagen) ─────────────────────────────────────

export interface ActiviteitTotaal {
  activiteit_id: string
  kostprijs: number
  lijnen: { lijn_id: string; totaal: number }[]
}

export interface BtwGroep {
  pct: number     // te heffen percentage (0 bij verlegd)
  basis: number   // verkoopprijs waarover dit tarief berekend wordt
  btw: number     // BTW bedrag
  tarief_id?: string   // btw_tarieven.id, als de regels een tarief dragen
  label?: string       // bijv. 'Verlegd Hoog 21%'
  verlegd?: boolean
  nominaal_pct?: number  // tarief zoals de klant het kent (21 bij verlegd hoog)
}

export interface ProjectTotalen {
  kostprijs: number
  opslag_ak: number
  opslag_wr: number
  opslag_overhead: number
  verkoopprijs: number
  btw: number
  btw_groepen: BtwGroep[]
  totaal_incl: number
  marge_euro: number
  marge_pct: number
}

// ─── App state helpers ────────────────────────────────────────────────────────

export interface ProjectBoomNode {
  type: 'project' | 'deelproject' | 'locatie' | 'element'
  id: string
  naam: string
  children?: ProjectBoomNode[]
  volgorde: number
}

export interface Selectie {
  type: 'element' | 'locatie' | 'deelproject' | 'project'
  id: string
}

// ─── Nieuwe calculatiestructuur: Groepen + Calculatieregels ──────────────────

export interface Groep {
  id: string
  scenario_id: string
  parent_id: string | null
  naam: string
  niveau: 1 | 2 | 3
  volgorde: number
  ingeklapt?: boolean
  optioneel?: boolean   // telt niet mee in eindtotaal
}

export interface Calculatieregel {
  id: string
  groep_id: string
  omschrijving: string
  werkomschrijving?: string  // uitgebreide werkomschrijving (uitklapbaar)
  hoeveelheid: number
  eenheid: Eenheid
  volgorde: number
  opslag_pct?: number    // opslag per regel; default = scenario AK + W&R
  is_stelpost?: boolean      // provisorische som / stelpost
  is_verrekenbaar?: boolean  // verrekenbare post (apart getoond in offerte)
  gemarkeerd?: boolean       // visuele markering (oranje)
  /** Gekozen tarief uit `btw_tarieven` (stamgegevens); draagt label + verlegd-vlag. */
  btw_tarief_id?: string
  /** Te heffen BTW-percentage. Bij een verlegd tarief 0 — het tarief zelf staat in btw_tarief_id. */
  btw_pct?: number
  opmerking?: string     // interne opmerking (niet zichtbaar voor opdrachtgever)
  schilderbehandeling_id?: string  // gekozen schilder_behandelingen.id — de bron; tekst wordt pas bij de offerte bevroren
  schilderbehandeling?: string  // legacy snapshot van de behandelingstekst (oude regels zonder _id); fallback bij import
  meetstaat_aggregaat_id?: string  // gekoppeld aan MeetregelAggregaat (indicator: uit meetstaat)
  werkomschrijving_afbeeldingen?: string[]  // base64 afbeeldingen bij de werkomschrijving
  kostengroep?: string  // optionele groeperingslabel voor werkbegroting (bijv. 'Bouwplaats')
}

// ─── Instellingen ─────────────────────────────────────────────────────────────

export interface Instellingen {
  // NB: hier stond ooit `btw_tarieven: number[]`. Vervallen — BTW-tarieven komen uit de
  // stamgegevenstabel `btw_tarieven` (zie lib/stamdata/btw.ts), niet uit calc-instellingen.
  kolom_namen?: Partial<Record<string, string>>  // ColId → aangepaste naam
  uurtarieven?: { label: string; tarief: number; is_favoriet?: boolean }[]
  eenheden?: EenheidConfig[]                     // afkorting + omschrijving; STP/VRR = auto-vinkje
  categorieen?: string[]                         // bijv. ['Schilderwerk', 'Timmerwerk', ...]
  categorieCodes?: Record<string, string>        // bijv. { 'Schilderwerk': 'SC', ... }
  standaard_kostengroepen?: string[]             // bijv. ['Bouwplaats', 'Bereikbaarheid', 'Arbeid']
}

export type ComponentType = 'arbeid' | 'materieel' | 'onderaanneming'

export interface Componentregel {
  id: string
  calculatieregel_id: string
  type: ComponentType
  norm_hoeveelheid: number   // per eenheid van de calculatieregel (bijv. uur/m²)
  eenheid?: Eenheid          // eenheid van de norm (bijv. uur, ltr, kg)
  tarief: number             // prijs per eenheid van het component (€/uur, €/st)
  opslag_pct?: number        // opslag per component; default = calculatieregel opslag_pct
  omschrijving?: string      // beschrijving componentregel
  leverancier?: string       // leverancier (bij materieel)
  aannemersnaam?: string     // naam onderaannemer (bij onderaanneming)
  offertenummer?: string     // offertenummer (bij onderaanneming)
}

// ─── MEETSTAAT ───────────────────────────────────────────────────────────────

export interface Meetstaat {
  id: string
  project_id: string
  scenario_id: string
  naam: string
  code: string                    // bijv. MS-2024-001
  status: 'concept' | 'definitief' | 'gesynchroniseerd'
  aangemaakt_op: string
  aangepast_op: string
}

export interface Meetregel {
  id: string
  meetstaat_id: string
  groep_id: string
  volgorde: number
  // Schilderwerk bibliotheek IDs (gekoppeld aan schilder_* tabellen)
  onderdeel_id?: string
  type_id?: string
  behandeling_id?: string
  // Weergavenamen (ook ingevuld als IDs niet beschikbaar zijn)
  onderdeel?: string
  type?: string
  behandeling?: string
  // Formule uit schilder_types (gekopieerd bij type-selectie)
  formule?: string      // bijv. '2*B+2*H' voor m¹
  omschrijving?: string           // handmatige override op auto-omschrijving
  bestek_kenmerk?: string         // RAL, spec, besteksreferentie
  // Maatvoering
  breedte?: number
  hoogte?: number
  lengte?: number
  aantal: number
  eenheid: string                 // 'm²' | 'm¹' | 'st'
  hoeveelheid_override?: number   // handmatige override
  // Status
  is_leeg: boolean                // true = alleen in client-state, nog niet in DB
  aangepast_op: string
}

export interface MeetregelAggregaat {
  id: string
  meetstaat_id: string
  groep_id: string
  // Aggregatiesleutel (vrije tekst fase 1)
  onderdeel: string
  type: string
  behandeling: string
  // Schilder bibliotheek IDs (worden gevuld zodra meetregels met IDs beschikbaar zijn)
  onderdeel_id?: string
  type_id?: string
  behandeling_id?: string
  // Totalen
  totaal_hoeveelheid: number
  eenheid: string
  // Koppeling calculatieregel
  calculatieregel_id?: string
  is_gesynchroniseerd: boolean
  aangepast_op: string
}

// ─── Materialen bibliotheek ───────────────────────────────────────────────────

export type MateriaalStatus = 'actief' | 'inactief'

export const MATERIAAL_GROEPEN = [
  'Verf & lak', 'Grondverf & primer', 'Plamuur & kit',
  'Hout & plaat', 'Bevestiging', 'Vloeistof & oplosmiddel',
  'Bescherming & verpakking', 'Gereedschap', 'Overig',
] as const

export type MateriaalBron = 'handmatig' | 'excel' | 'dico_import' | 'dico_api'

export interface Materiaal {
  id: string
  leverancier?: string
  artikelnummer?: string
  omschrijving: string
  materiaalgroep?: string
  eenheid: string
  kostprijs: number
  status: MateriaalStatus
  aangepast_op: string

  // Merk van het artikel (indien de leverancier dit meelevert; staat los van leverancier)
  merk?: string

  // DICO / Ketenstandaard / ETIM (optioneel; gevuld via DICO-import of -sync)
  gtin?: string
  etim_klasse?: string
  leverancier_gln?: string
  // Ruwe productgroep zoals de leverancier die aanlevert (DICO BuyingGroup);
  // wordt via dico_groep_mapping gekoppeld aan de eigen `materiaalgroep`.
  leverancier_productgroep?: string
  bron?: MateriaalBron
  externe_ref?: string
  gesynct_op?: string | null
}

// ─── WERKBEGROTING ────────────────────────────────────────────────────────────

export type WerkbegrotingStatus = 'concept' | 'definitief' | 'geaccordeerd'

export interface Werkbegroting {
  id: string
  project_id: string
  scenario_id: string
  naam: string
  status: WerkbegrotingStatus
  aangemaakt_op: string
  bijgewerkt_op: string
}

export interface WerkbegrotingRegel {
  id: string
  werkbegroting_id: string
  source_calculatieregel_id: string | null
  groep_id: string
  omschrijving: string
  hoeveelheid: number   // altijd readonly in UI — nooit aanpasbaar
  eenheid: Eenheid
  kostengroep?: string
  volgorde: number
  opslag_pct?: number
  btw_tarief_id?: string
  btw_pct?: number
  opmerking?: string
  is_stelpost?: boolean
  is_verwijderd?: boolean
}

export interface WerkbegrotingComponent {
  id: string
  werkbegroting_regel_id: string
  source_component_id: string | null
  type: ComponentType
  norm_hoeveelheid: number
  eenheid?: Eenheid
  tarief: number
  opslag_pct?: number
  omschrijving?: string
  relatie_id?: string        // gekoppeld aan relaties tabel
  leverancier_naam?: string  // fallback vrije tekst
  aannemersnaam?: string
  offertenummer?: string     // specificatie bij onderaanneming
  artikelnummer?: string     // specificatie bij materieel
  uurtype?: string           // specificatie bij arbeid (bijv. 'Gezel', 'Leerling')
  bouw7_line_id?: number     // Bouw7 contract-order-line id (dedup bij re-import uit Bouw7)
  /** Winkelbudget: budgetreservering bij een leverancier i.p.v. losse artikelen (alleen materiaal). */
  is_winkel?: boolean
  is_verwijderd?: boolean
}

export interface WerkbegrotingWijziging {
  id: string
  werkbegroting_id: string
  werkbegroting_regel_id: string | null
  component_id: string | null
  veld: string           // bijv. 'tarief', 'norm_hoeveelheid', 'relatie_id'
  oude_waarde: string | null
  nieuwe_waarde: string | null
  user_id: string | null
  aangemaakt_op: string
}

export interface WerkbegrotingBestelling {
  id: string
  werkbegroting_id: string
  omschrijving: string
  relatie_id?: string
  status: 'concept' | 'verzonden' | 'bevestigd'
  component_ids: string[]  // opgelost uit junction bij laden
  /** Welk Bouw7-document dit wordt. Volgt uit het componenttype (onderaanneming → oa_contract). */
  soort?: 'inkooporder' | 'oa_contract'
  /** Gevuld zodra de bestelling in Bouw7 staat; anker voor bijwerken i.p.v. dupliceren. */
  bouw7_contract_id?: number | null
  /** Contractnummer uit Bouw7, bv. "20261.00357OA002". */
  bouw7_nummer?: string | null
  /** Leverbon die Bouw7 bij het afroepen maakte, bv. "20261.00357OA002B001". */
  bouw7_leverbon_id?: number | null
  bouw7_bonnummer?: string | null
  bouw7_sync_status?: string | null
  bouw7_sync_fout?: string | null
  /** Gevuld zodra de order naar de leverancier is gemaild; maakt de bestelling onwijzigbaar. */
  verstuurd_op?: string | null
  /**
   * Gevuld zodra EVA merkt dat het contract in Bouw7 is verwijderd. De koppelvelden zijn dan
   * leeg (regels weer bestelbaar); `bouw7_nummer` blijft staan als spoor van wat er stond.
   */
  bouw7_verwijderd_op?: string | null
  /** Lever-/startdatum (ISO-datum) of vrije tekst ("week 34") — Bouw7 accepteert beide. */
  levering_datum?: string | null
  levering_tekst?: string | null
  betaalafspraak?: string | null
  interne_notitie?: string | null
}

export interface RelatieRef {
  id: string
  naam: string
  types: string[]
  email?: string | null
  telefoon?: string | null
}

// ─── Bibliotheek item (Supabase, vereenvoudigd voor calculatie) ───────────────

export interface BibliotheekItemVereenvoudigd {
  id: string
  item_code: string
  full_name: string
  description?: string | null
  onderdeel: string
  default_unit: string
  /**
   * Gevuld bij recepten uit de Schilderwerkbibliotheek. Bij het toevoegen aan een
   * calculatie wordt de behandeling gekoppeld in plaats van de werkomschrijving
   * gekopieerd — zo blijft de tekst live tot hij bij de offerte bevriest.
   */
  schilderbehandeling_id?: string | null
  /** Code van die behandeling ("OHD 03"); de receptenzoeker zoekt er mede op. */
  behandeling_code?: string | null
  labor_norms: {
    hours_per_unit: number
    hour_rate: number
    cost_per_unit: number
  }[]
  material_norms: {
    material_name: string | null
    quantity_per_unit: number
    unit_price: number
    cost_per_unit: number
    unit: string
    norm_type: string
  }[]
}
