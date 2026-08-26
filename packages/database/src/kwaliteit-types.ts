/**
 * Kwaliteitscontrole buitenschil — types en labels.
 *
 * Deze module is client-veilig: geen `server-only`, geen Supabase-import. De mobiele
 * inspectieschermen, de desktop-schermen en de rapportgenerator delen deze definities.
 *
 * Match met `supabase/migrations/20260825b_kwaliteitscontrole.sql`. De DB kent de enums als
 * CHECK-constraints (geen Postgres-enums), dus uitbreiden vraagt een `alter ... drop/add constraint`
 * plus een aanpassing hier. De `Record<...>`-labelmappen hieronder zijn exhaustive: een nieuwe
 * waarde toevoegen laat de compiler alle plekken aanwijzen die hem moeten kennen.
 *
 * Uitbreiden naar binnenverbouwing (tegelwerk, stucwerk binnen, plafonds, vloerafwerking) vraagt
 * geen wijziging hier: een discipline is data, geen type.
 */

// ── Discipline ───────────────────────────────────────────────────────────────

export type KwaliteitDiscipline = {
  code: string
  naam: string
  /** 'buitenschil' nu; een tweede groep is puur seed-data. */
  groep: string
  volgorde: number
  actief: boolean
  /** Algemeen staat elke ronde aan en is niet uit te zetten. */
  altijd_aan: boolean
}

// ── Controlepunt ─────────────────────────────────────────────────────────────

export type KwaliteitInspectieType =
  | 'visueel' | 'meting' | 'functioneel' | 'document' | 'gecombineerd'

export type KwaliteitAspect =
  | 'technisch' | 'functioneel' | 'esthetisch' | 'veiligheid'

export type KwaliteitBronType = 'NORM' | 'FABRIKANT' | 'PROJECT' | 'INTERN'

export type KwaliteitErnst = 'kritiek' | 'technisch' | 'esthetisch' | 'observatie'

export type KwaliteitControlepunt = {
  id: string
  code: string
  discipline_code: string
  component: string | null
  subcomponent: string | null
  titel: string
  korte_vraag: string
  toelichting: string | null

  inspectie_type: KwaliteitInspectieType
  kwaliteitsaspect: KwaliteitAspect
  /** 'ja' = JA is het goede antwoord; 'nee' = NEE is het goede antwoord; null = niet binair. */
  binair_voldoet_bij: 'ja' | 'nee' | null

  meting_verplicht: boolean
  meting_optioneel: boolean
  meetmethode: string | null
  meetmiddel: string | null
  eenheid: string | null
  min_waarde: number | null
  max_waarde: number | null
  doel_waarde: number | null
  tolerantie_min: number | null
  tolerantie_plus: number | null

  /** Sleutel in kwaliteit_project_eisen; die waarde overschrijft de grenswaarden hierboven. */
  project_eis_sleutel: string | null

  acceptatie_regel: string | null
  afkeur_regel: string | null

  bron_type: KwaliteitBronType
  bron_document: string | null
  bron_versie: string | null
  bron_paragraaf: string | null
  bron_omschrijving: string | null
  eis_tekst: string | null

  foto_verplicht_bij_afkeur: boolean
  foto_altijd_verplicht: boolean
  sta_niet_beoordeeld: boolean
  sta_nvt: boolean
  sta_nader_onderzoek: boolean

  standaard_ernst: KwaliteitErnst

  rapport_tekst_voldoet: string | null
  rapport_tekst_voldoet_niet: string | null
  standaard_herstelactie: string | null

  volgorde: number
  actief: boolean
}

// ── Inspectie ────────────────────────────────────────────────────────────────

export type KwaliteitInspectieStatus = 'concept' | 'definitief'

export type KwaliteitInspectie = {
  id: string
  inspectienummer: string
  dossier_id: string
  task_id: string | null
  datum: string
  tijd: string | null
  inspecteur_id: string | null
  weer: string | null
  werkzaamheden_omschrijving: string | null
  gebied_omschrijving: string | null
  discipline_codes: string[]
  algemene_opmerkingen: string | null
  steekproef_bekeken: number | null
  steekproef_afwijkend: number | null
  status: KwaliteitInspectieStatus
  definitief_op: string | null
  definitief_door: string | null
  heropend_op: string | null
  heropend_door: string | null
  heropen_reden: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

// ── Resultaat ────────────────────────────────────────────────────────────────

export type KwaliteitResultaatStatus =
  | 'voldoet' | 'voldoet_niet' | 'niet_beoordeeld' | 'nvt' | 'nader_onderzoek'

/**
 * De eis zoals die op het inspectiemoment gold. Wordt als snapshot in
 * `kwaliteit_resultaten.toegepaste_eis` opgeslagen, zodat een latere bijstelling in de bibliotheek
 * een verzonden rapport niet met terugwerkende kracht verandert.
 */
export type KwaliteitEis = {
  min_waarde: number | null
  max_waarde: number | null
  doel_waarde: number | null
  tolerantie_min: number | null
  tolerantie_plus: number | null
  eenheid: string | null
  eis_tekst: string | null
  bron_type: KwaliteitBronType
  bron_document: string | null
  /** true wanneer een projecteis de bibliotheekwaarde heeft overschreven. */
  uit_projecteis: boolean
  /** true wanneer er helemaal geen grenswaarde bekend is (project moet hem nog invullen). */
  geen_waarde_bekend: boolean
}

export type KwaliteitResultaat = {
  id: string
  inspectie_id: string
  controlepunt_id: string
  status: KwaliteitResultaatStatus
  antwoord: 'ja' | 'nee' | null
  gemeten_waarde: number | null
  gemeten_waarde_2: number | null
  gemeten_waarde_3: number | null
  meetlocatie: string | null
  meetmiddel: string | null
  berekend_voldoet: boolean | null
  toegepaste_eis: KwaliteitEis | Record<string, never>
  opmerking: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

// ── Waarneming, afwijking, foto ──────────────────────────────────────────────

export type KwaliteitWaarneming = {
  id: string
  inspectie_id: string
  discipline_code: string | null
  locatie: string | null
  omschrijving: string
  created_at: string
  created_by: string | null
}

export type KwaliteitAfwijkingStatus =
  | 'open'
  | 'gemeld'
  | 'herstel_gepland'
  | 'in_uitvoering'
  | 'gereed_voor_hercontrole'
  | 'hersteld_akkoord'
  | 'niet_akkoord'
  | 'nader_onderzoek'
  | 'geaccepteerde_afwijking'

export type KwaliteitAfwijking = {
  id: string
  afwijkingsnummer: string
  dossier_id: string
  inspectie_id: string
  resultaat_id: string | null
  controlepunt_id: string | null
  controlepunt_code: string | null
  discipline_code: string | null
  locatie: string | null
  datum_constatering: string
  inspecteur_id: string | null
  eis_tekst: string | null
  gemeten_waarde: number | null
  eenheid: string | null
  status: KwaliteitAfwijkingStatus
  ernst: KwaliteitErnst
  omschrijving: string | null
  voorgestelde_actie: string | null
  verantwoordelijke_type: 'medewerker' | 'relatie' | null
  verantwoordelijke_medewerker_id: string | null
  verantwoordelijke_relatie_id: string | null
  gewenste_hersteldatum: string | null
  herstelopmerking: string | null
  hercontrole_inspectie_id: string | null
  hercontrole_datum: string | null
  hercontroleur_id: string | null
  vergrendeld: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export type KwaliteitAfwijkingHistorie = {
  id: string
  afwijking_id: string
  van_status: string | null
  naar_status: string
  opmerking: string | null
  door: string | null
  op: string
}

export type KwaliteitFotoSoort =
  | 'overzicht' | 'detail' | 'afwijking' | 'meetbewijs' | 'positief' | 'herstel'

export type KwaliteitFoto = {
  id: string
  inspectie_id: string | null
  resultaat_id: string | null
  afwijking_id: string | null
  waarneming_id: string | null
  url: string
  soort: KwaliteitFotoSoort
  omschrijving: string | null
  created_at: string
  created_by: string | null
}

// ── Projecteis en referentievlak ─────────────────────────────────────────────

export type KwaliteitProjectEis = {
  id: string
  dossier_id: string
  sleutel: string
  label: string
  waarde_tekst: string | null
  min_waarde: number | null
  max_waarde: number | null
  doel_waarde: number | null
  tolerantie_min: number | null
  tolerantie_plus: number | null
  eenheid: string | null
  eis_tekst: string | null
  bron_type: KwaliteitBronType
  bron_document: string | null
  notitie: string | null
}

export type KwaliteitReferentievlak = {
  id: string
  dossier_id: string
  discipline_code: string | null
  omschrijving: string
  locatie: string | null
  datum: string
  goedgekeurd_door: string | null
  kleur: string | null
  voegprofiel: string | null
  structuur: string | null
  meetwaarden: Record<string, unknown>
  foto_urls: string[]
  created_at: string
  created_by: string | null
}

// ── Labels ───────────────────────────────────────────────────────────────────

export const kwaliteitResultaatStatusLabels: Record<KwaliteitResultaatStatus, string> = {
  voldoet:         'Voldoet',
  voldoet_niet:    'Voldoet niet',
  niet_beoordeeld: 'Niet beoordeeld',
  nvt:             'N.v.t.',
  nader_onderzoek: 'Nader onderzoek',
}

/**
 * Toelichting die de opzichter te zien krijgt bij het kiezen van een status. Vooral
 * `niet_beoordeeld` heeft die nodig: dat is expliciet géén akkoord.
 */
export const kwaliteitResultaatStatusUitleg: Record<KwaliteitResultaatStatus, string> = {
  voldoet:         'De controle of meetwaarde voldoet aan het kwaliteitscriterium.',
  voldoet_niet:    'Afwijking geconstateerd. Foto, locatie en toelichting zijn verplicht.',
  niet_beoordeeld: 'Aanwezig, maar nu niet betrouwbaar zichtbaar, bereikbaar of controleerbaar. Dit is géén akkoord.',
  nvt:             'Dit controlepunt is niet van toepassing op het aangetroffen werk.',
  nader_onderzoek: 'Specialistische beoordeling nodig; niet zelf beoordelen.',
}

export const kwaliteitErnstLabels: Record<KwaliteitErnst, string> = {
  kritiek:     'Kritiek',
  technisch:   'Technisch',
  esthetisch:  'Esthetisch',
  observatie:  'Observatie',
}

export const kwaliteitErnstUitleg: Record<KwaliteitErnst, string> = {
  kritiek:    'Veiligheid, constructief risico of directe waterdichtheid.',
  technisch:  'Technisch of duurzaamheidscriterium voldoet niet.',
  esthetisch: 'Functioneert technisch, maar de eindkwaliteit voldoet niet.',
  observatie: 'Aandachtspunt zonder directe afkeur.',
}

export const kwaliteitAfwijkingStatusLabels: Record<KwaliteitAfwijkingStatus, string> = {
  open:                    'Open',
  gemeld:                  'Gemeld',
  herstel_gepland:         'Herstel gepland',
  in_uitvoering:           'In uitvoering',
  gereed_voor_hercontrole: 'Gereed voor hercontrole',
  hersteld_akkoord:        'Hersteld en akkoord',
  niet_akkoord:            'Niet akkoord na herstel',
  nader_onderzoek:         'Nader onderzoek',
  geaccepteerde_afwijking: 'Geaccepteerde afwijking',
}

export const kwaliteitBronTypeLabels: Record<KwaliteitBronType, string> = {
  NORM:       'Norm',
  FABRIKANT:  'Fabrikant',
  PROJECT:    'Project',
  INTERN:     'Interne bedrijfsnorm',
}

/** Korte codes voor compacte weergave, zoals in de opzet: [N] [F] [P] [E]. */
export const kwaliteitBronTypeKort: Record<KwaliteitBronType, string> = {
  NORM:      'N',
  FABRIKANT: 'F',
  PROJECT:   'P',
  INTERN:    'E',
}

export const kwaliteitInspectieTypeLabels: Record<KwaliteitInspectieType, string> = {
  visueel:      'Visuele controle',
  meting:       'Meting',
  functioneel:  'Functionele controle',
  document:     'Documentcontrole',
  gecombineerd: 'Gecombineerd',
}

export const kwaliteitAspectLabels: Record<KwaliteitAspect, string> = {
  technisch:   'Technische kwaliteit',
  functioneel: 'Functionele kwaliteit',
  esthetisch:  'Esthetische eindkwaliteit',
  veiligheid:  'Veiligheid',
}

/**
 * Toegestane statusovergangen in het afwijkingenregister. Een overgang die hier niet staat wordt
 * geweigerd; zo kan een hersteld-en-akkoord punt niet stilletjes terug naar open.
 */
export const KWALITEIT_AFWIJKING_TRANSITIES: Record<KwaliteitAfwijkingStatus, KwaliteitAfwijkingStatus[]> = {
  open:                    ['gemeld', 'herstel_gepland', 'in_uitvoering', 'nader_onderzoek', 'geaccepteerde_afwijking'],
  gemeld:                  ['herstel_gepland', 'in_uitvoering', 'nader_onderzoek', 'geaccepteerde_afwijking'],
  herstel_gepland:         ['in_uitvoering', 'gemeld', 'nader_onderzoek', 'geaccepteerde_afwijking'],
  in_uitvoering:           ['gereed_voor_hercontrole', 'herstel_gepland', 'nader_onderzoek'],
  gereed_voor_hercontrole: ['hersteld_akkoord', 'niet_akkoord', 'nader_onderzoek'],
  // Niet akkoord na herstel loopt terug het uitvoeringstraject in; dat is de hele bedoeling.
  niet_akkoord:            ['in_uitvoering', 'herstel_gepland', 'nader_onderzoek'],
  // Nader onderzoek is een zijspoor: na de uitslag kan het alle kanten op.
  nader_onderzoek:         ['open', 'herstel_gepland', 'in_uitvoering', 'geaccepteerde_afwijking', 'hersteld_akkoord'],
  // Twee eindstations.
  hersteld_akkoord:        [],
  geaccepteerde_afwijking: [],
}

/** Statussen die als afgehandeld tellen; de rest is openstaand. */
export const KWALITEIT_AFWIJKING_AFGEROND: KwaliteitAfwijkingStatus[] = [
  'hersteld_akkoord', 'geaccepteerde_afwijking',
]

/**
 * Meetmiddelen (§34 van de opzet). Bewust een vaste lijst in code in plaats van een
 * apparatenregister met merk, serienummer en kalibratiedatum: dat is met de opdrachtgever
 * afgesproken en scheelt een beheerscherm dat niemand bijhoudt.
 */
export const KWALITEIT_MEETMIDDELEN = [
  'houtvochtmeter',
  'schuifmaat',
  'voelermaat',
  'scheurwijdtemeter',
  'rei 300 mm',
  'rei 1 m',
  'rei 2 m',
  'waterpas',
  'laser',
  'rolmaat',
  'thermometer',
  'oppervlaktethermometer',
  'hygrometer',
  'vochtmeter',
  'laagdiktemeter',
  'glansmeter',
  'colorimeter',
  'hechtingstestset',
  'trekproefapparatuur',
] as const

/**
 * Snelkeuze voor de locatie van een bevinding. De opzichter kan altijd zelf iets typen; deze lijst
 * bespaart hem het meest voorkomende typewerk. Bewust niet per project in te richten — dat is een
 * expliciete keuze van de opdrachtgever.
 */
export const KWALITEIT_LOCATIE_SUGGESTIES = [
  'Voorgevel',
  'Achtergevel',
  'Zijgevel links',
  'Zijgevel rechts',
  'Kopgevel',
  'Dak',
  'Dakrand',
  'Balkon',
  'Entree',
  'Blok A',
  'Blok B',
  'Verdieping 1',
  'Verdieping 2',
  'Begane grond',
] as const

/** Voorbeelden voor een positieve kwaliteitswaarneming; de opzichter kan ook vrij typen. */
export const KWALITEIT_WAARNEMING_SUGGESTIES = [
  'Strak schilderwerk',
  'Goede houtreparatie',
  'Nette kitvoeg',
  'Verzorgd voegwerk',
  'Correct dakdetail',
  'Schoon werkgebied',
  'Nette aansluiting tussen disciplines',
] as const
