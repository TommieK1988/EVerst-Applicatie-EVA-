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
  /**
   * Route-segment van het dossier: aanvragen | offertes | opdrachten | servicedesk.
   * Er bestaat géén /dossiers/[id]-route — een dossier woont onder zijn eigen sectie.
   * Null als de factuur geen EVA-dossier heeft; dan is er ook niets om naartoe te linken.
   */
  dossier_sectie: 'aanvragen' | 'offertes' | 'opdrachten' | 'servicedesk' | null

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

  bewakingscode: string | null
  bewakingscode_naam: string | null

  is_geboekt_in_exact: boolean | null
  keten_verloopt_op: string | null

  huidige_goedkeurder_naam: string | null
  huidige_goedkeurder_id: string | null
  bouw7_approval_id: string | null

  /** Aangemerkt door de directie om mee te gaan in de eerstvolgende betaling. */
  markering_betalen: boolean
  betalen_op: string | null

  /** At-read berekend, niet opgeslagen — verandert elke dag. */
  dagen_tot_vervaldatum: number | null
  /** True als de ingelogde gebruiker nu aan zet is. */
  mijn_beurt: boolean
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

/**
 * Link naar het dossier van deze factuur, of `null` als er geen dossier aan hangt.
 *
 * `/dossiers/<id>` bestaat niet — dat gaf een 404. Een dossier woont onder zijn sectie:
 * /aanvragen, /offertes, /opdrachten of /servicedesk.
 */
export function dossierHref(rij: Pick<InkoopfactuurRij, 'dossier_id' | 'dossier_sectie'>): string | null {
  if (!rij.dossier_id || !rij.dossier_sectie) return null
  return `/${rij.dossier_sectie}/${rij.dossier_id}`
}
