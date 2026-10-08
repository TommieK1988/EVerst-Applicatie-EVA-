import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { hashComponentenSet } from '@/lib/everts-calc/goedkeuring-hash'
import type { WerkbegrotingComponent } from '@/lib/everts-calc/types'

/**
 * Accordering van één opdracht of bestelling (`goedkeuringen.object_type = 'bestelling'`).
 *
 * Op een servicedeskbon is dát de beslissing: deze partij, dit bedrag. Een bon heeft geen
 * werkbegroting die iemand beoordeelt — de regels staan er onder water alleen omdat de weg naar
 * Bouw7 erlangs loopt. Daarom accordeert de beoordelaar hier de opdracht zelf, en niet de
 * werkbegroting eromheen.
 *
 * Het akkoord bewaart de componenten-hash (`object_hash`). Verandert er daarna iets aan de
 * opdracht — bedrag, partij, omschrijving — dan klopt de hash niet meer en is het akkoord
 * vervallen. De Bouw7-regel-id zit bewust niet in die hash: die verandert juist ná het akkoord.
 */

/** De actuele componenten-hash van een bestelling, uit Supabase. */
export async function berekenBestellingHash(bestellingId: string): Promise<string> {
  const db = createAdminClient()
  const { data: koppels } = await db.from('werkbegroting_bestelling_regels')
    .select('component_id').eq('bestelling_id', bestellingId)
  const ids = (koppels ?? []).map(k => k.component_id)
  if (ids.length === 0) return hashComponentenSet([])
  const { data: rijen } = await db.from('werkbegroting_componenten').select('*').in('id', ids)
  const componenten = (rijen ?? []).map((c): WerkbegrotingComponent => ({
    id: c.id, werkbegroting_regel_id: c.werkbegroting_regel_id,
    source_component_id: c.source_component_id ?? null, type: c.type as WerkbegrotingComponent['type'],
    norm_hoeveelheid: Number(c.norm_hoeveelheid ?? 0), eenheid: c.eenheid ?? undefined,
    tarief: Number(c.tarief ?? 0), opslag_pct: c.opslag_pct != null ? Number(c.opslag_pct) : undefined,
    omschrijving: c.omschrijving ?? undefined, relatie_id: c.relatie_id ?? undefined,
    leverancier_naam: c.leverancier_naam ?? undefined, aannemersnaam: c.aannemersnaam ?? undefined,
    offertenummer: c.offertenummer ?? undefined,
    is_verwijderd: c.is_verwijderd ?? false,
  }))
  return hashComponentenSet(componenten)
}

export type BestellingAccordering = {
  /** De laatste ronde, of null als er nooit iets is aangevraagd. */
  laatste: {
    id: string
    status: 'aangevraagd' | 'goedgekeurd' | 'afgekeurd' | 'ingetrokken'
    beoordelaar_id: string | null
    gedelegeerd_aan: string | null
    meekijkers: string[] | null
    aangevraagd_door: string | null
  } | null
  /** Er is een akkoord, en de opdracht is sindsdien niet veranderd. */
  geldig: boolean
}

/**
 * Hoe staat de accordering van deze bestelling ervoor?
 *
 * `actueleHash` mag de aanroeper meegeven als hij de componenten al in handen heeft (de gate in
 * `maakBestellingInBouw7` toetst de payload die hij gaat versturen); anders komt hij uit Supabase.
 */
export async function bestellingAccordering(
  bestellingId: string,
  actueleHash?: string,
): Promise<BestellingAccordering> {
  const db = createAdminClient()
  const { data: rondes } = await db.from('goedkeuringen')
    .select('id, status, object_hash, beoordelaar_id, gedelegeerd_aan, meekijkers, aangevraagd_door, ronde')
    .eq('object_type', 'bestelling').eq('object_id', bestellingId)
    .order('ronde', { ascending: false })
  const lijst = rondes ?? []
  const laatsteRij = lijst[0] ?? null
  const akkoord = lijst.find(r => r.status === 'goedgekeurd') ?? null

  let geldig = false
  if (akkoord?.object_hash) {
    const hash = actueleHash ?? await berekenBestellingHash(bestellingId)
    geldig = hash === akkoord.object_hash
  }

  return {
    laatste: laatsteRij
      ? {
          id: laatsteRij.id,
          status: laatsteRij.status as NonNullable<BestellingAccordering['laatste']>['status'],
          beoordelaar_id: laatsteRij.beoordelaar_id,
          gedelegeerd_aan: laatsteRij.gedelegeerd_aan,
          meekijkers: laatsteRij.meekijkers,
          aangevraagd_door: laatsteRij.aangevraagd_door,
        }
      : null,
    geldig,
  }
}
