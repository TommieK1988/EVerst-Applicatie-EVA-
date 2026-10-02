import 'server-only'

/**
 * De rekenstap achter het contracttotaal van een servicedeskbon — hetzelfde getal als de
 * Verkoop-tab. Losgemaakt uit `contracttotaal.ts` omdat dat een `'use server'`-module is: elke
 * export daar is een publiek aanroepbare action, en deze functie heeft zelf geen rechtencontrole.
 * De aanroepers doen die: het bord via `laadContracttotalen` (`servicedesk` lezen), het mobiele
 * contactpersoonbeeld via de modulegate van Commercieel.
 */

import { getDossierVerkoop } from './actions'
import { getDossierMeerwerk } from './meerwerk'
import { getRegieFactuurvoorstel } from './servicedesk'
import { berekenContracttotaalVerkoop } from './contractwaarde'

export type ContracttotaalKaart = {
  totaal: number
  aanneemsom: number
  /** Meerwerk tegen een vaste prijs. */
  aangenomen: number
  /** Regie/nacalculatie: geboekte verkoopwaarde, of het mandaat als dat hoger is. */
  regie: number
  /** Meerwerk volgens Bouw7 — alleen betekenisvol als `evaBron` false is. */
  meerwerk: number
  evaBron: boolean
}

export async function berekenContracttotaal(dossierId: string): Promise<ContracttotaalKaart | null> {
  const [verkoop, meerwerk, voorstel] = await Promise.all([
    getDossierVerkoop(dossierId),
    getDossierMeerwerk(dossierId).catch(() => null),
    getRegieFactuurvoorstel(dossierId).catch(() => null),
  ])
  const ct = berekenContracttotaalVerkoop({
    basis: verkoop.totalen,
    goedgekeurdAantal: meerwerk?.totalen.goedgekeurdAantal ?? 0,
    meerwerk: meerwerk?.totalen ?? null,
    nacalculatie: voorstel,
  })
  return {
    totaal: ct.contractTotaal,
    aanneemsom: ct.aanneemsom,
    aangenomen: ct.waarde.aangenomen,
    regie: ct.waarde.regie,
    meerwerk: ct.meerwerk,
    evaBron: ct.evaBron,
  }
}

/**
 * Contracttotalen voor een lijst bonnen, `gelijktijdig` tegelijk. Een bon die faalt krijgt
 * `null` en laat de rest staan: één kapotte snapshot mag niet alle bedragen wegnemen.
 */
export async function berekenContracttotalen(
  ids: string[],
  gelijktijdig: number,
): Promise<Record<string, ContracttotaalKaart | null>> {
  const uit: Record<string, ContracttotaalKaart | null> = {}
  let volgende = 0

  async function werker(): Promise<void> {
    for (;;) {
      const i = volgende++
      if (i >= ids.length) return
      uit[ids[i]] = await berekenContracttotaal(ids[i]).catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(gelijktijdig, ids.length) }, werker))
  return uit
}
