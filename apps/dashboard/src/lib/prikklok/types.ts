// Types voor de digitale prikklok. Handgeschreven: database.types.ts wordt bewust niet
// geregenereerd zolang daar werk-in-uitvoering van anderen in zit.

export type PrikklokFase = 'schaduw' | 'live'

export type PrikklokInstellingen = {
  fase: PrikklokFase
  tester_ids: string[]
  straal_m: number
  max_nauwkeurigheid_m: number
  afronding_min: number
  pauze_min: number
  pauze_vanaf_min: number
  herinnering_na_min: number
}

export type UitWijze = 'locatie' | 'wissel' | 'handmatig'

export type PogingReden =
  | 'te_ver'
  | 'geen_coordinaten'
  | 'slechte_nauwkeurigheid'
  | 'geen_gps'
  | 'geweigerd'

/** Wat de telefoon meestuurt. De afstand rekent de server zelf uit. */
export type Positie = {
  lat: number
  lng: number
  nauwkeurigheid: number | null
}

/**
 * Positie óf testlocatie. Een testlocatie (alleen in de schaduwfase) neemt de coördinaten van het
 * gekozen dossier over; de sessie krijgt dan `gesimuleerd = true`.
 */
export type PositieInvoer =
  | { soort: 'gps'; positie: Positie }
  | { soort: 'test'; dossierId: string }

/** Een sessie zoals de rekenlaag en de schermen hem nodig hebben. */
export type PrikklokSessie = {
  id: string
  datum: string
  dossier_id: string
  dossier_label: string
  bewakingscode: string | null
  bouw7_psl_id: number | null
  uursoort_id: string | null
  in_op: string
  uit_op: string | null
  uit_wijze: UitWijze | null
  uit_afstand_m: number | null
  in_afstand_m: number
  gesimuleerd: boolean
}

export type Werklocatie = {
  id: string
  label: string
  adres: string | null
  klant: string | null
  afstand_m: number
  ingepland: boolean
}
