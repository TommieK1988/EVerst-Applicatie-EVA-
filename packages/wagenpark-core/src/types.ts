/**
 * Domein-types voor wagenpark-beheer.
 * Spiegelen de database-tabellen uit `supabase/migrations/20260417_wagenpark.sql`.
 *
 * Na het regenereren van `@everts/database/database.types.ts` zullen sommige
 * types door de gegenereerde versie vervangen kunnen worden.
 */

// ---------------------------------------------------------------------
// Enums (zelfde waarden als Postgres enum-types)
// ---------------------------------------------------------------------
export type VoertuigType =
  | 'werkbus'
  | 'bestelwagen'
  | 'station_mini_suv'
  | 'station_midi_suv'
  | 'personenauto'
  | 'aanhanger'
  | 'overig'

export type BrandstofType =
  | 'diesel'
  | 'benzine'
  | 'elektrisch'
  | 'hybride'
  | 'lpg'
  | 'waterstof'
  | 'onbekend'

export type VoertuigStatus = 'actief' | 'in_onderhoud' | 'uit_dienst' | 'verkocht'

export type RitTypeBerekend = 'zakelijk' | 'prive'

export type BevindingErnst = 'info' | 'waarschuwing' | 'overtreding'

export type BevindingStatus =
  | 'open'
  | 'geaccepteerd_uitzondering'
  | 'opgelost'
  | 'afgewezen'

// ---------------------------------------------------------------------
// Voertuigen & bestuurders
// ---------------------------------------------------------------------
export type Voertuig = {
  id: string
  kenteken: string
  merk: string | null
  model: string | null
  type: VoertuigType | null
  brandstof: BrandstofType | null
  kleur: string | null
  ingebruikname_datum: string | null
  bouwjaar: number | null
  bijtelling_betaald: boolean
  prive_limiet_km_jaar: number | null
  zakelijk_verwacht_km_jaar: number | null
  status: VoertuigStatus
  opmerkingen: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type VoertuigInput = Partial<Omit<Voertuig, 'id' | 'created_at' | 'updated_at'>> & {
  kenteken: string
}

export type VoertuigBestuurder = {
  id: string
  voertuig_id: string
  medewerker_id: string
  start_datum: string
  eind_datum: string | null
  is_primair: boolean
  notities: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// Lease
// ---------------------------------------------------------------------
export type LeaseContract = {
  id: string
  voertuig_id: string
  leasemaatschappij_relatie_id: string | null
  contractnummer: string | null
  start_datum: string
  eind_datum: string | null
  maandtermijn_bedrag: number | null
  km_bundel_per_jaar: number | null
  meer_km_tarief: number | null
  minder_km_tarief: number | null
  bijtelling_percentage: number | null
  contract_document_url: string | null
  opmerkingen: string | null
  actief: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// RDW
// ---------------------------------------------------------------------
export type RdwData = {
  id: string
  voertuig_id: string | null
  kenteken: string
  apk_vervaldatum: string | null
  massa_ledig_voertuig: number | null
  massa_rijklaar: number | null
  toegestane_maximum_massa: number | null
  aantal_zitplaatsen: number | null
  aantal_cilinders: number | null
  cilinderinhoud: number | null
  brandstof_omschrijving: string | null
  milieuclassificatie: string | null
  wok_status: boolean | null
  vervaldatum_tenaamstelling: string | null
  eerste_toelating: string | null
  datum_tenaamstelling: string | null
  rdw_raw: unknown
  laatst_opgehaald: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------
// ULU data
// ---------------------------------------------------------------------
export type UluImport = {
  id: string
  bestandsnaam: string | null
  bron: 'excel' | 'api'
  type: 'trips' | 'parking'
  aantal_rijen: number | null
  periode_start: string | null
  periode_eind: string | null
  upload_door: string | null
  aangemaakt_op: string
}

export type UluTrip = {
  id: string
  voertuig_id: string | null
  medewerker_id: string | null
  bestuurder_naam_raw: string | null
  user_id_ulu: number | null
  kenteken: string
  start_datum: string
  start_tijd: string
  stop_tijd: string | null
  adres_start: string | null
  adres_stop: string | null
  afstand_km: number | null
  duur_seconden: number | null
  km_stand_start: number | null
  km_stand_stop: number | null
  rit_type_ulu: string | null
  rit_type_berekend: RitTypeBerekend | null
  score: number | null
  import_batch_id: string | null
  created_at: string
}

/** Trip zoals uit xlsx/API geparseerd — nog vóór persist. */
export type UluTripInput = Omit<
  UluTrip,
  'id' | 'created_at' | 'rit_type_berekend' | 'voertuig_id' | 'medewerker_id'
> & {
  voertuig_id?: string | null
  medewerker_id?: string | null
}

export type UluParking = {
  id: string
  voertuig_id: string | null
  kenteken: string
  parkeer_starttijd: string
  parkeerlocatie: string | null
  parkeerkosten: number | null
  duur_seconden: number | null
  import_batch_id: string | null
  created_at: string
}

export type UluParkingInput = Omit<
  UluParking,
  'id' | 'created_at' | 'voertuig_id'
> & {
  voertuig_id?: string | null
}

// ---------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------
export type HandboekRegelCode =
  | 'R1'
  | 'R2a'
  | 'R2b'
  | 'R3'
  | 'R5'
  | 'R6'
  | 'R7'
  | string

export type HandboekRegel = {
  id: string
  code: HandboekRegelCode
  titel: string
  beschrijving: string | null
  actief: boolean
  drempel_config: Record<string, unknown>
  aangemaakt_op: string
  gewijzigd_op: string
}

export type ComplianceBevinding = {
  id: string
  regel_code: HandboekRegelCode
  voertuig_id: string | null
  medewerker_id: string | null
  trip_id: string | null
  periode_start: string | null
  periode_eind: string | null
  ernst: BevindingErnst
  omschrijving: string
  data: Record<string, unknown>
  status: BevindingStatus
  gegenereerd_op: string
  updated_at: string
}

export type ComplianceBevindingInput = Omit<
  ComplianceBevinding,
  'id' | 'gegenereerd_op' | 'updated_at' | 'status'
> & {
  status?: BevindingStatus
}
