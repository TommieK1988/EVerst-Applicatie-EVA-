'use server'

/**
 * Meerwerk klaarzetten als conceptfactuur vanuit het blok "Meerwerk in termijnstaat" op de
 * Verkoop-tab. De regels over wat wel en niet factureerbaar is staan in
 * `meerwerk-facturatie-stand.ts`; hier zitten de rechtencheck en de writes.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht } from '@/lib/auth/rechten'
import { ververSnapshotsNaSchrijven } from '@/lib/bouw7/snapshot'
import { assertDossierBewerkbaar } from './guards'
import { zetMeerwerkAlsTermijn } from './meerwerk-termijn'
import { zetTermijnenKlaar } from './termijnen'
import {
  leesBouw7, bepaalStanden, termijnRegels, leesMeerwerkFacturatieStand,
  type MeerwerkFacturatieStand,
} from './meerwerk-facturatie-stand'

export type MeerwerkControle =
  | { ok: true; regels: MeerwerkFacturatieStand[]; heeftTermijnstaat: boolean }
  | { ok: false; error: string }

/** Live controle in Bouw7: welk meerwerk is nog te factureren, en welk niet meer. */
export async function controleerMeerwerkFacturatie(dossierId: string): Promise<MeerwerkControle> {
  await vereisRecht('financieel', 'lezen')
  return leesMeerwerkFacturatieStand(dossierId)
}

export type MeerwerkKlaarzetResultaat =
  | { ok: true; facturen: number; termijnen: number; fouten: string[] }
  | { ok: false; error: string }

/**
 * Zet de gekozen meerwerktermijnen klaar als conceptfactuur.
 *
 * `keuze` is per regel de lijst schema-posities. `apart` = één factuur per meerwerkregel; anders
 * alles samen op één factuur. Een regel in `twijfel` gaat alleen mee als hij in `twijfelBevestigd`
 * staat: de gebruiker heeft dan gezien dat er buiten de termijnen om gefactureerd is.
 */
export async function zetMeerwerkKlaar(
  dossierId: string,
  keuze: { regelId: string; indexen: number[] }[],
  opts: { apart: boolean; twijfelBevestigd?: string[] },
): Promise<MeerwerkKlaarzetResultaat> {
  await vereisRecht('financieel', 'schrijven')
  await assertDossierBewerkbaar(dossierId)
  if (keuze.every(k => k.indexen.length === 0)) return { ok: false, error: 'Kies eerst een of meer termijnen.' }

  // Vlak vóór de write opnieuw lezen: het scherm kan achterlopen op wat de administratie deed.
  const regels = await termijnRegels(dossierId)
  const perRegel = new Map(regels.map(r => [r.id, r]))
  const b = await leesBouw7(dossierId)
  if ('fout' in b) return { ok: false, error: `${b.fout} Er is niets klaargezet.` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const standen = new Map(bepaalStanden(regels, b).map(st => [st.regelId, st]))
  const bevestigd = new Set(opts.twijfelBevestigd ?? [])
  const fouten: string[] = []
  const groepen: number[][] = []

  for (const k of keuze) {
    if (k.indexen.length === 0) continue
    const r = perRegel.get(k.regelId)
    if (!r) { fouten.push('Een gekozen meerwerkregel is niet meer goedgekeurd of bestaat niet meer.'); continue }
    const stand = standen.get(r.id)!
    const naam = `${stand.code} ${r.omschrijving ?? ''}`.trim()
    const mag = stand.stand === 'open' || (stand.stand === 'twijfel' && bevestigd.has(r.id))
    if (!mag) { fouten.push(`${naam}: ${stand.reden}`); continue }

    let termIds: (number | null)[] = stand.termijnen.map(t => t.bouw7TermId)
    if (stand.handmatigeTermIds.length > 0) {
      // Met de hand gemaakte termijn vanaf nu vastleggen, zodat een bedragwijziging of een
      // tweede klik dezelfde termijn gebruikt in plaats van er een naast te zetten.
      await supabase.from('meerwerk_regels')
        .update({ bouw7_term_id: stand.handmatigeTermIds[0], bouw7_term_ids: stand.handmatigeTermIds, bouw7_term_pending: false })
        .eq('id', r.id)
    } else if (termIds.some(id => id == null)) {
      const t = await zetMeerwerkAlsTermijn(r.id)
      if (!t.ok) { fouten.push(`${naam}: ${t.error}`); continue }
      termIds = t.termIds
    }

    const gekozen: number[] = []
    for (const i of k.indexen) {
      const t = stand.termijnen[i]
      const id = termIds[i]
      if (!t || id == null) { fouten.push(`${naam}: termijn ${i + 1} is niet gevonden.`); continue }
      if (t.gefactureerd) { fouten.push(`${naam}: "${t.omschrijving}" staat al op een factuur.`); continue }
      gekozen.push(id)
    }
    if (gekozen.length > 0) groepen.push(gekozen)
  }

  const reeksen = opts.apart ? groepen : (groepen.length > 0 ? [groepen.flat()] : [])
  let facturen = 0
  let termijnen = 0
  for (const ids of reeksen) {
    const res = await zetTermijnenKlaar(dossierId, ids)
    if (res.ok) { facturen++; termijnen += res.aantal } else fouten.push(res.error)
  }

  await ververSnapshotsNaSchrijven(dossierId, ['termijnen', 'athena_control'], ['athena_financial']).catch(() => {})
  revalidatePath(`/opdrachten/${dossierId}/verkoop`)

  if (facturen === 0) return { ok: false, error: fouten.join(' ') || 'Er is niets klaargezet.' }
  return { ok: true, facturen, termijnen, fouten }
}
