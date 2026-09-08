/**
 * Types en pure helpers voor de inkoopfacturen-module.
 *
 * Bewust géén `'use server'`: hier staan constanten, types en functies die de client mag
 * importeren. Een `'use server'`-module mag alleen async functies exporteren, en `tsc` vangt die
 * fout niet — pas de Next-build valt om. Houd dat scheiding dus strikt: data en berekeningen
 * hier, server-actions in `actions.ts`.
 */

export type InkoopfactuurRij = {
  id: string
  bouw7_invoice_id: string
  factuurnummer: string | null
  betalingskenmerk: string | null
  boekstuknummer: string | null
  bouw7_status: number | null
  status: string

  leverancier_naam: string | null
  leverancier_type: string | null

  bouw7_project_id: string | null
  project_naam: string | null
  project_nummer: string | null
  dossier_id: string | null
  /** Afgeleid uit het dossier; bepaalt of de factuur bij een opdracht of de servicedesk hoort. */
  dossier_sectie: 'opdracht' | 'servicedesk' | null

  divisie_naam: string | null
  divisie_exact_id: string | null
  journaalcode_inkoop: string | null
  vestiging_naam: string | null

  bedrag_excl: number | null
  btw_bedrag: number | null
  bedrag_incl: number | null
  factuurdatum: string | null
  vervaldatum: string | null
  datum_betaald: string | null

  bouw7_opmerking: string | null
  ordernummer: string | null
  bon_nummer: string | null

  is_geboekt_in_exact: boolean | null
  keten_verloopt_op: string | null

  huidige_goedkeurder_naam: string | null
  huidige_goedkeurder_id: string | null
  bouw7_approval_id: string | null

  betaalronde_id: string | null
  betaalronde_naam: string | null

  /** At-read berekend, niet opgeslagen — verandert elke dag. */
  dagen_tot_vervaldatum: number | null
  /** True als de ingelogde gebruiker nu aan zet is. */
  mijn_beurt: boolean
}

export type BetaalrondeRij = {
  id: string
  naam: string
  betaaldatum: string | null
  status: string
  opmerking: string | null
  aantal_facturen: number
  totaal_incl: number
}

/**
 * Dagen tot de vervaldatum. Negatief = verlopen. Rekent in hele dagen op de lokale kalender,
 * niet in millisecondes: anders slaat de uitkomst rond middernacht en over een zomertijdgrens
 * een dag om.
 */
export function dagenTotVervaldatum(vervaldatum: string | null, vandaag = new Date()): number | null {
  if (!vervaldatum) return null
  const [j, m, d] = vervaldatum.slice(0, 10).split('-').map(Number)
  if (!j || !m || !d) return null
  const doel = Date.UTC(j, m - 1, d)
  const nu = Date.UTC(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate())
  return Math.round((doel - nu) / 86_400_000)
}

export type VervalKleur = 'verlopen' | 'bijna' | 'ok' | 'geen'

export function vervalKleur(dagen: number | null): VervalKleur {
  if (dagen == null) return 'geen'
  if (dagen < 0) return 'verlopen'
  if (dagen < 7) return 'bijna'
  return 'ok'
}
