import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { hashWerkbegrotingRegel } from '@/lib/everts-calc/goedkeuring-hash'
import type { WerkbegrotingComponent, WerkbegrotingRegel } from '@/lib/everts-calc/types'
import type { GoedkeuringRegelSnapshot } from './types'

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
      .select('regel_id, regel_hash')
      .eq('goedkeuring_id', goedkeuring.id)
    snapshot = (rows ?? []) as GoedkeuringRegelSnapshot[]
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

  return berekenStatusUitData(werkbegrotingId, goedkeuring?.id ?? null, snapshot, regels, componenten)
}

/** Pure variant: status berekenen uit al opgehaalde data (hergebruik in gates). */
export async function berekenStatusUitData(
  werkbegrotingId: string,
  laatsteGoedkeuringId: string | null,
  snapshot: GoedkeuringRegelSnapshot[],
  actieveRegels: WerkbegrotingRegel[],
  actieveComponenten: WerkbegrotingComponent[],
): Promise<WerkbegrotingServerStatus> {
  const snapshotMap = new Map(snapshot.map(s => [s.regel_id, s.regel_hash]))
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
      const actueel = await hashWerkbegrotingRegel(regel, compsPerRegel.get(regel.id) ?? [])
      goedgekeurd = actueel === verwacht
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
