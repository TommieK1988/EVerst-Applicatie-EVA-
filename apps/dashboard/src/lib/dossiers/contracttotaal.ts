'use server'

/**
 * Het contracttotaal van een servicedeskbon voor de kaart op het bord — hetzelfde getal als de
 * Verkoop-tab van die bon. Zelfde drie bronnen, zelfde rekenregel (`berekenContracttotaalVerkoop`);
 * zou de kaart een eigen benadering gebruiken, dan staat er vroeg of laat een ander bedrag op de
 * kaart dan op de tab.
 *
 * Duur: per regiebon zo'n twintig Postgres-lezingen (snapshots, factuurinstellingen), geen
 * Bouw7-aanroepen. Voor een heel bord is dat een paar seconden, daarom haalt het bord dit na de
 * eerste render op in plaats van de pagina erop te laten wachten.
 */

import { vereisRecht } from '@/lib/auth/rechten'
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

/** Hoeveel bonnen tegelijk: genoeg om snel te zijn zonder de database te overvragen. */
const GELIJKTIJDIG = 8
/** Bovengrens per aanroep; het bord toont er rond de 150. */
const MAX_BONNEN = 600

async function berekenContracttotaal(dossierId: string): Promise<ContracttotaalKaart | null> {
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
 * Contracttotalen voor een lijst bonnen. Een bon die faalt krijgt `null` en laat de rest staan:
 * één kapotte snapshot mag niet het hele bord zonder bedragen laten.
 */
export async function laadContracttotalen(
  dossierIds: string[],
): Promise<Record<string, ContracttotaalKaart | null>> {
  await vereisRecht('servicedesk', 'lezen')

  const ids = [...new Set(dossierIds)].slice(0, MAX_BONNEN)
  const uit: Record<string, ContracttotaalKaart | null> = {}
  let volgende = 0

  async function werker(): Promise<void> {
    for (;;) {
      const i = volgende++
      if (i >= ids.length) return
      uit[ids[i]] = await berekenContracttotaal(ids[i]).catch(() => null)
    }
  }
  await Promise.all(Array.from({ length: Math.min(GELIJKTIJDIG, ids.length) }, werker))
  return uit
}
