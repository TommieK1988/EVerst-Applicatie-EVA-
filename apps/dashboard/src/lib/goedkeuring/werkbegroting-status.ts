import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { hashWerkbegrotingRegelInhoud, kostenInCenten } from '@/lib/everts-calc/goedkeuring-hash'
import type { WerkbegrotingComponent, WerkbegrotingRegel } from '@/lib/everts-calc/types'
import { naarRegelSnapshot, type GoedkeuringRegelSnapshot } from './types'

export type WerkbegrotingServerStatus = {
  werkbegrotingId: string
  /** Laatste goedkeuring met status 'goedgekeurd' (null = nooit geaccordeerd). */
  laatsteGoedkeuringId: string | null
  ooitGoedgekeurd: boolean
  /** Per actieve (niet-verwijderde) regel: valt hij onder de laatste accordering? */
  regels: { regel_id: string; goedgekeurd: boolean }[]
  /** Alle actieve regels goedgekeurd én geen geaccordeerde regels verwijderd. */
  volledigGoedgekeurd: boolean
  snapshot: GoedkeuringRegelSnapshot[]
}

/**
 * Berekent server-side — uit de gesynchroniseerde Supabase-data — welke regels
 * van een werkbegroting onder de laatste accordering vallen. Dit is de waarheid
 * voor alle gates; de client gebruikt dezelfde hash-logica alleen voor badges.
 */
export async function berekenWerkbegrotingStatus(werkbegrotingId: string): Promise<WerkbegrotingServerStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // 1. Laatste goedgekeurde ronde + snapshot.
  const { data: goedkeuring } = await db
    .from('goedkeuringen')
    .select('id')
    .eq('object_type', 'werkbegroting')
    .eq('object_id', werkbegrotingId)
    .eq('status', 'goedgekeurd')
    .order('ronde', { ascending: false })
    .limit(1)
    .maybeSingle()

  let snapshot: GoedkeuringRegelSnapshot[] = []
  if (goedkeuring) {
    const { data: rows } = await db
      .from('werkbegroting_goedkeuring_regels')
      .select('regel_id, regel_hash, kosten_centen')
      .eq('goedkeuring_id', goedkeuring.id)
    snapshot = (rows ?? []).map(naarRegelSnapshot)
  }

  // 2. Actuele actieve regels + componenten.
  const { data: regelRows } = await db
    .from('werkbegroting_regels')
    .select('*')
    .eq('werkbegroting_id', werkbegrotingId)
    .eq('is_verwijderd', false)
  const regels = (regelRows ?? []) as WerkbegrotingRegel[]

  let componenten: WerkbegrotingComponent[] = []
  if (regels.length > 0) {
    const { data: compRows } = await db
      .from('werkbegroting_componenten')
      .select('*')
      .in('werkbegroting_regel_id', regels.map((r: WerkbegrotingRegel) => r.id))
      .eq('is_verwijderd', false)
    componenten = (compRows ?? []) as WerkbegrotingComponent[]
  }

  const status = await berekenStatusUitData(werkbegrotingId, goedkeuring?.id ?? null, snapshot, regels, componenten)
  if (goedkeuring) await vulOntbrekendeKosten(db, goedkeuring.id, status, regels, componenten)
  return status
}

/**
 * Vult `kosten_centen` alsnog voor snapshots van vóór die kolom — maar alleen waar
 * dat aantoonbaar veilig is: als de regel nu nog exact gelijk is aan het geaccordeerde
 * origineel (de inhoudshash matcht), dan is de huidige kostprijs ook de geaccordeerde
 * kostprijs.
 *
 * Zonder dit zouden opdrachten die al geaccordeerd waren tot hun volgende
 * goedkeuringsronde de oude, strenge regel houden: een leverancierswissel zou daar
 * alsnog om een nieuw akkoord vragen. `regel_hash` blijft ongemoeid, zodat een
 * oudere deploy op dezelfde database niets merkt. Best effort — mislukt de update,
 * dan gebeurt het de volgende keer.
 */
async function vulOntbrekendeKosten(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  goedkeuringId: string,
  status: WerkbegrotingServerStatus,
  regels: WerkbegrotingRegel[],
  componenten: WerkbegrotingComponent[],
): Promise<void> {
  const zonderBedrag = status.snapshot.filter(s => s.kosten_centen == null)
  if (zonderBedrag.length === 0) return

  const goedgekeurd = new Set(status.regels.filter(r => r.goedgekeurd).map(r => r.regel_id))
  const regelById = new Map(regels.map(r => [r.id, r]))

  for (const rij of zonderBedrag) {
    if (!goedgekeurd.has(rij.regel_id)) continue
    const regel = regelById.get(rij.regel_id)
    if (!regel) continue
    const centen = kostenInCenten(regel, componenten.filter(c => c.werkbegroting_regel_id === regel.id))
    try {
      await db.from('werkbegroting_goedkeuring_regels')
        .update({ kosten_centen: centen })
        .eq('goedkeuring_id', goedkeuringId)
        .eq('regel_id', rij.regel_id)
      rij.kosten_centen = centen
    } catch { /* stil — volgende keer opnieuw */ }
  }
}

/** Pure variant: status berekenen uit al opgehaalde data (hergebruik in gates). */
export async function berekenStatusUitData(
  werkbegrotingId: string,
  laatsteGoedkeuringId: string | null,
  snapshot: GoedkeuringRegelSnapshot[],
  actieveRegels: WerkbegrotingRegel[],
  actieveComponenten: WerkbegrotingComponent[],
): Promise<WerkbegrotingServerStatus> {
  const snapshotMap = new Map(snapshot.map(s => [s.regel_id, s]))
  const compsPerRegel = new Map<string, WerkbegrotingComponent[]>()
  for (const c of actieveComponenten) {
    const arr = compsPerRegel.get(c.werkbegroting_regel_id) ?? []
    arr.push(c)
    compsPerRegel.set(c.werkbegroting_regel_id, arr)
  }

  const regels: { regel_id: string; goedgekeurd: boolean }[] = []
  let alleGoedgekeurd = true
  for (const regel of actieveRegels) {
    const verwacht = snapshotMap.get(regel.id)
    let goedgekeurd = false
    if (verwacht != null) {
      const comps = compsPerRegel.get(regel.id) ?? []
      // Het akkoord gaat over geld: zolang de kostprijs gelijk blijft, valt de regel
      // eronder — ook na een andere leverancier, omschrijving of bewakingscode.
      // Snapshots van vóór de kostenkolom hebben dat bedrag nog niet; die vallen terug
      // op de inhoudshash (zie vulOntbrekendeKosten, dat vult ze alsnog aan).
      goedgekeurd = verwacht.kosten_centen != null
        ? kostenInCenten(regel, comps) === verwacht.kosten_centen
        : (await hashWerkbegrotingRegelInhoud(regel, comps)) === verwacht.regel_hash
    }
    if (!goedgekeurd) alleGoedgekeurd = false
    regels.push({ regel_id: regel.id, goedgekeurd })
  }

  // Verwijderde geaccordeerde regels tellen ook als wijziging (set-vergelijking).
  const actieveIds = new Set(actieveRegels.map(r => r.id))
  const verwijderdeGeaccordeerd = snapshot.some(s => !actieveIds.has(s.regel_id))

  const ooitGoedgekeurd = laatsteGoedkeuringId != null
  const volledigGoedgekeurd = ooitGoedgekeurd && alleGoedgekeurd && !verwijderdeGeaccordeerd && actieveRegels.length > 0

  return { werkbegrotingId, laatsteGoedkeuringId, ooitGoedgekeurd, regels, volledigGoedgekeurd, snapshot }
}
