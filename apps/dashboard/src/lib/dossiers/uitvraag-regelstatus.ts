/**
 * uitvraag-regelstatus.ts — Wat het calculatiegrid per regel toont over de uitvragen:
 * "Uitgevraagd · 2" of "Rekent met Voegbedrijf A".
 */

import type { RegelUitvraagStatus, UitvraagPakket } from './uitvraag-pakket-types'

/** Telt niet mee: een partij die is ingetrokken of afgevallen. */
const TELT_MEE = (status: string) => status !== 'ingetrokken' && status !== 'afgevallen'

/**
 * Per calculatieregel-id de status. Staat een regel in meerdere pakketten, dan wint het pakket
 * met een "rekent met"; anders het nieuwste (de pakketten komen nieuwste eerst binnen).
 */
export function regelUitvraagStatussen(pakketten: UitvraagPakket[]): Map<string, RegelUitvraagStatus> {
  const uit = new Map<string, RegelUitvraagStatus>()
  for (const p of pakketten) {
    const rekent = p.partijen.find(x => x.rekent_mee)
    const status: RegelUitvraagStatus = {
      uitgevraagd: p.partijen.filter(x => TELT_MEE(x.status)).length,
      rekentMet: rekent ? rekent.partij_naam : null,
      pakketId: p.id,
    }
    for (const post of p.posten) {
      const bestaand = uit.get(post.calculatieregel_id)
      if (!bestaand || (!bestaand.rekentMet && status.rekentMet)) uit.set(post.calculatieregel_id, status)
    }
  }
  return uit
}
