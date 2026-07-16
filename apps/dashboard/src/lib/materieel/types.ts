/**
 * Materieelbeheer — domeintypes + label/kleur-maps.
 *
 * Handgeschreven (niet uit database.types.ts gegenereerd) zodat de module los
 * staat en de gegenereerde types niet aangeraakt hoeven te worden. De app leest
 * via de admin-client (`as any`), net als de rest van het platform.
 */

/* ── Enums (spiegelen de Postgres-enums uit 20260715_materieelbeheer.sql) ── */

export const MATERIEEL_CATEGORIEEN = [
  'gereedschap', 'machine', 'aanhanger', 'keet',
  'steigeronderdeel', 'meetapparatuur', 'pbm',
] as const
export type MaterieelCategorie = typeof MATERIEEL_CATEGORIEEN[number]

export const CATEGORIE_LABELS: Record<MaterieelCategorie, string> = {
  gereedschap:      'Gereedschap',
  machine:          'Machine',
  aanhanger:        'Aanhanger',
  keet:             'Keet',
  steigeronderdeel: 'Steigeronderdeel',
  meetapparatuur:   'Meetapparatuur',
  pbm:              'PBM',
}

export const MATERIEEL_STATUSSEN = [
  'in_gebruik', 'beschikbaar', 'gereserveerd', 'onderhoud', 'defect', 'vermist',
] as const
export type MaterieelStatus = typeof MATERIEEL_STATUSSEN[number]

/** Label + tint + puntkleur per status (voor de badge). */
export const STATUS_META: Record<MaterieelStatus, { label: string; kleur: string; emoji: string }> = {
  in_gebruik:   { label: 'In gebruik',  kleur: '#16a34a', emoji: '🟢' },
  beschikbaar:  { label: 'Beschikbaar', kleur: '#eab308', emoji: '🟡' },
  gereserveerd: { label: 'Gereserveerd', kleur: '#2563eb', emoji: '🔵' },
  onderhoud:    { label: 'Onderhoud',   kleur: '#f97316', emoji: '🟠' },
  defect:       { label: 'Defect',      kleur: '#dc2626', emoji: '🔴' },
  vermist:      { label: 'Vermist',     kleur: '#334155', emoji: '⚫' },
}

export const TOEWIJZING_NIVEAUS = ['persoonlijk', 'team', 'algemeen'] as const
export type ToewijzingNiveau = typeof TOEWIJZING_NIVEAUS[number]

export const NIVEAU_LABELS: Record<ToewijzingNiveau, string> = {
  persoonlijk: 'Persoonlijk',
  team:        'Team',
  algemeen:    'Algemeen gebruik',
}

/**
 * Label voor materieel dat aan niemand persoonlijk en aan geen team hangt.
 * Zonder gekoppelde medewerker/team is materieel per definitie voor algemeen
 * gebruik — er bestaat dus geen "niet toegewezen"-toestand.
 */
export const ALGEMEEN_GEBRUIK = 'Algemeen gebruik'

/** Hangt dit object aan een persoon of team? Zo nee → algemeen gebruik. */
export function isAlgemeenGebruik(o: {
  toegewezen_medewerker_id: string | null
  toegewezen_team_id: string | null
}): boolean {
  return !o.toegewezen_medewerker_id && !o.toegewezen_team_id
}

/* ── Row-types ── */

export type MaterieelObject = {
  id: string
  inventarisnummer: string | null
  qr_code: string | null
  omschrijving: string
  categorie: MaterieelCategorie
  merk: string | null
  type: string | null
  serienummer: string | null
  aankoopdatum: string | null
  leverancier: string | null
  garantie_tot: string | null
  aanschafwaarde: number | null
  boekwaarde: number | null
  status: MaterieelStatus
  toewijzing_niveau: ToewijzingNiveau | null
  toegewezen_medewerker_id: string | null
  toegewezen_team_id: string | null
  details: Record<string, unknown>
  hoort_bij_object_id: string | null
  hoofdfoto_url: string | null
  opmerkingen: string | null
  laatst_gescand_at: string | null
  laatst_gescand_door: string | null
  actief: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Object verrijkt met de weergavenaam van de toewijzing (medewerker/team). */
export type MaterieelObjectRij = MaterieelObject & {
  toegewezen_naam: string | null
}

export type MaterieelTeam = {
  id: string
  naam: string
  type: 'bus' | 'keet' | 'ploeg' | 'algemeen'
  omschrijving: string | null
  kenteken: string | null
  /** Verantwoordelijke voor het materieel van dit team. */
  teamleider_id: string | null
  actief: boolean
}

export const TEAM_TYPES = ['bus', 'keet', 'ploeg', 'algemeen'] as const
export type TeamType = typeof TEAM_TYPES[number]
export const TEAM_TYPE_LABELS: Record<TeamType, string> = {
  bus: 'Servicebus', keet: 'Keet', ploeg: 'Ploeg', algemeen: 'Algemeen',
}

export const KEURING_UITKOMSTEN = ['goedgekeurd', 'voorwaardelijk', 'afgekeurd'] as const
export type KeuringUitkomst = typeof KEURING_UITKOMSTEN[number]

export const UITKOMST_META: Record<KeuringUitkomst, { label: string; kleur: string }> = {
  goedgekeurd:   { label: 'Goedgekeurd',   kleur: '#16a34a' },
  voorwaardelijk: { label: 'Goedgekeurd onder voorwaarden', kleur: '#f97316' },
  afgekeurd:     { label: 'Afgekeurd',     kleur: '#dc2626' },
}

export type MaterieelKeuring = {
  id: string
  object_id: string
  soort: string
  geldig_van: string | null
  geldig_tot: string | null
  document_url: string | null
  opmerking: string | null
  /** goedgekeurd | voorwaardelijk | afgekeurd */
  uitkomst: KeuringUitkomst | null
  /** Bijzonderheden van de keurmeester. */
  bevindingen: string | null
  /** Keurende partij (vaak extern). */
  uitgevoerd_door: string | null
  created_at: string
}

/** Eén regel op de historie-tijdlijn, samengesteld uit de bronbestanden. */
export type HistorieItem = {
  id: string
  wanneer: string
  soort: 'overdracht' | 'keuring' | 'onderhoud' | 'controle' | 'status' | 'scan'
  titel: string
  detail: string | null
  door: string | null
  /** Accentkleur van de tijdlijn-stip. */
  kleur: string
}

export const HISTORIE_SOORT_LABELS: Record<HistorieItem['soort'], string> = {
  overdracht: 'Overdracht',
  keuring:    'Keuring',
  onderhoud:  'Onderhoud',
  controle:   'Controle',
  status:     'Status',
  scan:       'Scan',
}

export type MaterieelControle = {
  id: string
  object_id: string
  controle_datum: string
  uitgevoerd_door: string | null
  aanwezig: boolean | null
  werkt_goed: boolean | null
  status: string | null
  opmerking: string | null
  foto_url: string | null
  created_at: string
}

export type MaterieelToewijzing = {
  id: string
  object_id: string
  niveau: ToewijzingNiveau
  medewerker_id: string | null
  team_id: string | null
  van: string
  tot: string | null
  door: string | null
  opmerking: string | null
  created_at: string
}

export type MaterieelScan = {
  id: string
  object_id: string
  gescand_door: string | null
  gescand_at: string
  locatie: string | null
  context: string | null
}

export type MaterieelOnderhoud = {
  id: string
  object_id: string
  type: string
  omschrijving: string | null
  datum: string
  kosten: number | null
  uitgevoerd_door: string | null
  status: string
  gemeld_door: string | null
  created_at: string
}

export type KeuringSoort = { key: string; label: string }

export type MaterieelInstellingen = {
  id: number
  controle_frequentie: string
  controle_moment: string
  keuring_waarschuwing_dagen: number
  apk_waarschuwing_dagen: number
  garantie_waarschuwing_dagen: number
  keuring_soorten: KeuringSoort[]
  updated_at: string
}

export const CONTROLE_FREQUENTIES = ['maandelijks', 'per_kwartaal', 'halfjaarlijks', 'jaarlijks'] as const
export type ControleFrequentie = typeof CONTROLE_FREQUENTIES[number]
export const FREQUENTIE_LABELS: Record<ControleFrequentie, string> = {
  maandelijks: 'Maandelijks', per_kwartaal: 'Per kwartaal',
  halfjaarlijks: 'Halfjaarlijks', jaarlijks: 'Jaarlijks',
}

/** Keuze-optie (medewerker of team) voor de toewijzing-picker. */
export type Optie = { id: string; naam: string }

/**
 * Categorie-specifieke velden die in `details` (jsonb) landen. Per categorie een
 * lijst van {key,label,type} zodat het paspoort/formulier ze generiek kan tonen.
 */
export type DetailVeld = { key: string; label: string; type: 'tekst' | 'nummer' | 'datum' | 'ja_nee' }

export const CATEGORIE_DETAILS: Partial<Record<MaterieelCategorie, DetailVeld[]>> = {
  aanhanger: [
    { key: 'kenteken', label: 'Kenteken', type: 'tekst' },
    { key: 'max_gewicht_kg', label: 'Max. gewicht (kg)', type: 'nummer' },
    { key: 'banden', label: 'Banden', type: 'tekst' },
    { key: 'slot', label: 'Slot aanwezig', type: 'ja_nee' },
    { key: 'verzekering', label: 'Verzekering', type: 'tekst' },
  ],
  keet: [
    { key: 'kenteken', label: 'Kenteken', type: 'tekst' },
    { key: 'sleutels', label: 'Aantal sleutels', type: 'nummer' },
    { key: 'brandblusser', label: 'Brandblusser aanwezig', type: 'ja_nee' },
    { key: 'ehbo', label: 'EHBO-kit aanwezig', type: 'ja_nee' },
    { key: 'huidige_locatie', label: 'Huidige locatie', type: 'tekst' },
  ],
  machine: [
    { key: 'vermogen', label: 'Vermogen', type: 'tekst' },
    { key: 'bouwjaar', label: 'Bouwjaar', type: 'nummer' },
  ],
  meetapparatuur: [
    { key: 'kalibratie_interval', label: 'Kalibratie-interval (maanden)', type: 'nummer' },
  ],
  pbm: [
    { key: 'maat', label: 'Maat', type: 'tekst' },
    { key: 'vervangdatum', label: 'Vervangdatum', type: 'datum' },
  ],
}

/** Accu-specifiek: koppeling aan machine + laadcycli/leeftijd (in `details`). */
export const ACCU_DETAILS: DetailVeld[] = [
  { key: 'laadcycli', label: 'Aantal laadcycli', type: 'nummer' },
  { key: 'capaciteit_ah', label: 'Capaciteit (Ah)', type: 'nummer' },
]

/** Scan-URL die in de QR-code gaat. `origin` valt in SSR terug op een relatief pad. */
export function scanUrl(objectId: string, origin?: string): string {
  const pad = `/materieelbeheer/${objectId}`
  return origin ? `${origin}${pad}` : pad
}
