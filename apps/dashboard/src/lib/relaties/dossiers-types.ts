/**
 * Vorm van de gekoppelde dossiers van een relatie.
 *
 * Apart van `./dossiers.ts` omdat dát bestand `server-only` is: het blok op de relatiepagina
 * is een client-component en zou de hele leeslaag (en daarmee de service-role-client) de
 * browserbundel in trekken. Hier staan alleen types en labels — geen queries.
 */
import type { DossierFase } from '@/lib/dossiers/fase'

/** In welke hoedanigheid een inkooppartij aan een dossier hangt. */
export type BetrokkenRol = 'inkoopfactuur' | 'bestelling' | 'uitvraag' | 'opleverpunt'

export const BETROKKEN_ROL_LABEL: Record<BetrokkenRol, string> = {
  inkoopfactuur: 'Inkoopfactuur',
  bestelling:    'Besteld',
  uitvraag:      'Uitgevraagd',
  opleverpunt:   'Opleverpunt',
}

export type RelatieDossier = {
  id: string
  dossiernummer: string | null
  titel: string
  fase: DossierFase
  /** Detailroute, servicedesk meegerekend. `null` = geen route waar we zeker van zijn. */
  href: string | null
  adres: string | null
  jaar: number | null
  updated_at: string
  /**
   * Opdrachtgever: gefactureerd excl. btw uit `management_projecten`.
   * Inkooppartij: som van de inkoopfacturen excl. btw, of `null` zonder recht daarop.
   */
  bedrag: number | null
  /** Alleen gevuld bij de inkoopvariant. */
  rollen: BetrokkenRol[]
}

export type RelatieDossierTotalen = {
  aantal: number
  lopend: number
  bedrag: number
  /**
   * Dossiers die gefactureerd hóren te zijn maar nog geen regel in `management_projecten`
   * hebben — die tabel wordt door een eigen sync gevuld en kan achterlopen. Zonder dit getal
   * zou een te laag totaal als volledig lezen. Alleen bij de opdrachtgeverkant.
   */
  zonderFacturatiegegevens: number
}

export type RelatieDossiersData = {
  klant: RelatieDossier[]
  klantTotalen: RelatieDossierTotalen
  betrokken: RelatieDossier[]
  betrokkenTotalen: RelatieDossierTotalen
  /** Zonder recht op inkoopfacturen blijven de bedragen bij de inkoopkant leeg. */
  toontInkoopbedragen: boolean
}

export const LEEG_DOSSIER_TOTAAL: RelatieDossierTotalen = {
  aantal: 0, lopend: 0, bedrag: 0, zonderFacturatiegegevens: 0,
}

export const LEGE_RELATIE_DOSSIERS: RelatieDossiersData = {
  klant: [], klantTotalen: LEEG_DOSSIER_TOTAAL,
  betrokken: [], betrokkenTotalen: LEEG_DOSSIER_TOTAAL,
  toontInkoopbedragen: false,
}
