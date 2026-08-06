export type QuoteType = 'verkoopofferte' | 'interne_calculatie'

// Twee statussen: 'concept' (bewerkbaar) en 'verzonden' (= definitief, vergrendeld).
// De overgang concept → verzonden gebeurt automatisch bij het verzenden van de offerte.
export type QuoteStatus =
  | 'concept'
  | 'verzonden'

export type TermType = 'voorwaarden' | 'uitsluitingen' | 'opmerkingen'

export type Discipline =
  | 'schilderwerk'
  | 'bouwkundig'
  | 'dakwerk'
  | 'meerwerk'
  | 'overig'

export interface Client {
  id: string
  naam: string
  bedrijfsnaam?: string | null
  adres?: string | null
  postcode?: string | null
  plaats?: string | null
  email?: string | null
  telefoon?: string | null
  kvk?: string | null
  btw_nummer?: string | null
  notities?: string | null
  actief: boolean
  created_at: string
  updated_at: string
}

export interface QuoteLayout {
  id: string
  naam: string
  beschrijving?: string | null
  logo_url?: string | null
  primaire_kleur: string
  is_standaard: boolean
  created_at: string
}

export interface QuoteTemplate {
  id: string
  naam: string
  beschrijving?: string | null
  standaard_voorwaarden?: string | null
  standaard_uitsluitingen?: string | null
  standaard_opmerkingen?: string | null
  standaard_aanhef?: string | null
  standaard_inleiding?: string | null
  standaard_slottekst?: string | null
  geldigheid_dagen: number
  is_standaard: boolean
  created_at: string
}

export interface QuoteTerm {
  id: string
  quote_id: string
  type: TermType
  inhoud: string
  volgorde: number
  created_at: string
}

export interface QuoteLine {
  id: string
  quote_id: string
  section_id?: string | null
  calculatieregel_id?: string | null
  groep_id?: string | null
  omschrijving: string
  hoeveelheid: number
  eenheid: string
  eenheidsprijs: number
  line_total: number
  /** Te heffen BTW-percentage — gelijk aan het nominale tarief, ook bij verlegging. */
  btw_pct: number
  /** Gekozen tarief uit `btw_tarieven` — bepaalt label en verlegd-vermelding op de offerte. */
  btw_tarief_id?: string | null
  volgorde: number
  /**
   * `tekst` = tekstregel zonder bedrag; leeg/`post` = gewone rekenregel.
   * Tekstregels tellen niet mee in het sectiesubtotaal of de BTW-uitsplitsing.
   */
  soort?: 'post' | 'tekst' | null
  kostprijs_pe?: number | null
  uren_pe?: number | null
  opmerking?: string | null
  schilderbehandeling?: string | null
  /** Bevroren naam van de behandeling ("2-laags dekkend") — los van de tekst, zodat de offerte hem onderstreept kan tonen. */
  schilderbehandeling_naam?: string | null
  /** Base64 data-URL's van foto's bij de werkomschrijving (overgenomen uit de calculatie). */
  werkomschrijving_afbeeldingen?: string[] | null
  is_stelpost: boolean
  created_at: string
  updated_at: string
}

export interface QuoteSection {
  id: string
  quote_id: string
  naam: string
  discipline?: Discipline | null
  volgorde: number
  subtotaal: number
  toon_detail: boolean
  is_optioneel: boolean
  niveau: number
  nummer?: string | null
  created_at: string
  lines?: QuoteLine[]
}

export interface Quote {
  id: string
  quote_nummer: string
  project_id?: string | null
  scenario_id?: string | null
  client_id?: string | null
  layout_id?: string | null
  template_id?: string | null
  type: QuoteType
  status: QuoteStatus
  titel: string
  referentie?: string | null
  datum: string
  geldig_tot?: string | null
  contactpersoon?: string | null
  aanhef: string
  inleiding?: string | null
  slottekst?: string | null
  subtotaal_ex_btw: number
  btw_bedrag: number
  totaal_inc_btw: number
  detailregels_tonen: boolean
  btw_pct: number
  stelposten_in_totaal: boolean
  stelposten_subtotaal: number
  opties_subtotaal: number
  betalingsconditie_id?: string | null
  voorwaarden_id?: string | null
  dossier_id?: string | null
  meerwerk_regel_id?: string | null
  created_at: string
  updated_at: string
  // Nested (optioneel, wordt ingeladen via joins)
  client?: Client | null
  sections?: QuoteSection[]
  terms?: QuoteTerm[]
}

// Formulierdata voor nieuw aanmaken
export interface NieuweQuoteData {
  type: QuoteType
  client_id?: string | null
  titel: string
  referentie?: string | null
  datum: string
  geldig_tot?: string | null
  project_id?: string | null
  scenario_id?: string | null
  template_id?: string | null
}
