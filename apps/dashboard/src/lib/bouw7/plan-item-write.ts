'use server'

/**
 * EVA-planning terugschrijven naar Bouw7 (`POST/DELETE /plan-item` op Heimdall).
 *
 * Zie WRITE-ENDPOINTS.md §5b voor de gecaptureerde endpoints en de uitgevraagde
 * schemavalidatie. Kort:
 *   - `POST /plan-item` zonder `id` → aanmaken (201), mét `id` → wijzigen (200)
 *   - `DELETE /plan-item` met `{ id }` in de **body** (niet in de URL)
 *
 * MAPPING — bewust één EVA-planitem = één Bouw7 plan-item met één medewerker.
 * Bouw7 kan meerdere medewerkers in één item (`employees[]`), en zijn eigen UI maakt ze
 * ook zo. Toch spiegelen we 1-op-1: een EVA-planitem is per medewerker gepland en kan per
 * medewerker verschuiven, gekopieerd en verwijderd worden. Zouden we groeperen, dan moet
 * elke verplaatsing van één medewerker de groep splitsen en elke verwijdering de rest
 * herschrijven — precies het soort operatie dat bij gelijktijdige wijzigingen stil data
 * wist. De prijs is cosmetisch: drie collega's op dezelfde dag geven in Bouw7 drie balken
 * in plaats van één met drie namen; in de medewerkerplanning ziet dat er hetzelfde uit.
 *
 * FAIL-SOFT: een mislukte write laat de EVA-planning ongemoeid staan en logt alleen. De
 * planning is in EVA leidend; Bouw7 loopt dan één wijziging achter tot de volgende write.
 */

import { createAdminClient } from '@everts/database/server'
import { getBouw7ClientOfNull } from './config'
import type { Bouw7Client } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Offset-suffix ("+02:00") voor Europe/Amsterdam, zomertijd-bewust — zie sync-planning.ts. */
function nlOffsetSuffix(d: Date): string {
  const naam = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(d)
    .find(p => p.type === 'timeZoneName')?.value // "GMT+02:00"
  const offset = naam?.replace('GMT', '')
  return offset && offset.length > 0 ? offset : '+01:00'
}

/**
 * Postgres-timestamptz naar ISO8601 mét expliciete tijdzone, in Nederlandse kloktijd.
 *
 * Heimdall weigert "2026-09-10 07:00:00" (de vorm die de Bouw7-UI-endpoints en de
 * Apollo-search juist wél gebruiken) met "This value is not a valid datetime", en
 * epoch-seconden ook. Een offset is verplicht. We schrijven NL-kloktijd omdat Bouw7 de
 * planning daarin toont; het blijft hetzelfde moment.
 */
function naarBouw7Datum(ts: string): string {
  const d = new Date(ts)
  const delen = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = (t: string) => delen.find(p => p.type === t)?.value ?? '00'
  // en-CA levert 24-uurs "24" voor middernacht; Bouw7 wil "00".
  const uur = g('hour') === '24' ? '00' : g('hour')
  return `${g('year')}-${g('month')}-${g('day')}T${uur}:${g('minute')}:${g('second')}${nlOffsetSuffix(d)}`
}

/** Het EVA-planitem met alles wat de Bouw7-body nodig heeft. */
type ItemContext = {
  itemId:         string
  bouw7Id:        number | null
  projectId:      number
  employeeId:     number
  titel:          string
  omschrijving:   string | null
  startDate:      string
  endDate:        string
  hours:          number
  securityCodeId: number | null
}

/**
 * Haal één planitem op met dossier-, medewerker- en activiteitgegevens. Geeft `null` als
 * het item niet terugschrijfbaar is: geen Bouw7-dossier, geen Bouw7-medewerker, of een rij
 * die uit Bouw7 zelf komt (`bron='bouw7'` schrijven we nooit terug — dan zouden lees- en
 * schrijfsync elkaar aan het werk houden).
 */
async function laadContext(itemId: string): Promise<ItemContext | null> {
  const { data } = await db()
    .from('planning_items')
    .select(`
      id, bouw7_id, bron, start_dt, eind_dt, uren,
      medewerkers!medewerker_id ( bouw7_id ),
      planning_activiteiten!activiteit_id (
        titel, omschrijving, bouw7_security_code_id,
        dossiers!dossier_id ( bouw7_id )
      )
    `)
    .eq('id', itemId)
    .maybeSingle()

  if (!data || data.bron !== 'eva') return null

  const act = data.planning_activiteiten
  const projectId  = Number(act?.dossiers?.bouw7_id)
  const employeeId = Number(data.medewerkers?.bouw7_id)
  if (!projectId || !employeeId) return null

  return {
    itemId:         data.id,
    bouw7Id:        data.bouw7_id ? Number(data.bouw7_id) : null,
    projectId,
    employeeId,
    titel:          (act?.titel ?? '').trim() || 'Planning',
    omschrijving:   act?.omschrijving ?? null,
    startDate:      naarBouw7Datum(data.start_dt),
    endDate:        naarBouw7Datum(data.eind_dt),
    hours:          Number(data.uren) || 0,
    securityCodeId: act?.bouw7_security_code_id ?? null,
  }
}

/**
 * De `securityPlanningLink` van een bewakingscode binnen een project.
 *
 * LET OP: dit is **niet** de bewakingscode-projectkoppeling uit
 * `/search/project-security-links` — dat is een andere entiteit met een eigen id-reeks
 * (4.0xx.xxx tegenover 41x.xxx). De planning-link komt alleen voor op bestaande
 * plan-items, dus we leiden hem af uit wat er al in het project gepland staat. Heeft het
 * project nog geen plan-item op die code, dan blijft de link onbekend en gaat het item
 * zónder taak/bewakingscode naar Bouw7 — het landt wél, alleen ongecodeerd.
 */
async function zoekPlanningLink(
  client: Bouw7Client,
  projectId: number,
  securityCodeId: number | null,
): Promise<number | null> {
  if (!securityCodeId) return null
  try {
    const res = await client.getApollo<{ items?: {
      securityPlanningLink?: { id: number; securityCode?: { id: number } | null } | null
    }[] }>('/search/plan-items', `project.id = ${projectId} limit 200`)
    for (const it of res.items ?? []) {
      const link = it.securityPlanningLink
      if (link?.id && link.securityCode?.id === securityCodeId) return link.id
    }
  } catch (e) {
    console.error('[plan-item-write] planning-link zoeken mislukt:', e)
  }
  return null
}

/**
 * Schrijf één EVA-planitem naar Bouw7 (aanmaken of bijwerken) en bewaar de Bouw7-id.
 *
 * Die id in `planning_items.bouw7_id` doet dubbel werk: hij maakt de volgende write een
 * update in plaats van een tweede item, én hij is het merkteken waaraan de lees-sync ziet
 * dat dit Bouw7 plan-item van EVA komt en dus niet nóg een keer als bron='bouw7'-rij
 * geïmporteerd moet worden (zie `evaEigenPlanItemIds`).
 */
export async function schrijfPlanItemNaarBouw7(itemId: string): Promise<void> {
  try {
    const ctx = await laadContext(itemId)
    if (!ctx) return

    const client = await getBouw7ClientOfNull()
    if (!client) return

    const linkId = await zoekPlanningLink(client, ctx.projectId, ctx.securityCodeId)

    const body: Record<string, unknown> = {
      ...(ctx.bouw7Id ? { id: ctx.bouw7Id } : {}),
      name:      ctx.titel,
      project:   { id: ctx.projectId },
      startDate: ctx.startDate,
      endDate:   ctx.endDate,
      hours:     ctx.hours,
      requisite: 1,
      employees: [{ id: ctx.employeeId }],
      ...(ctx.omschrijving ? { notes: ctx.omschrijving } : {}),
      ...(linkId ? { securityPlanningLink: { id: linkId } } : {}),
    }

    const res = await client.post<{ id?: number }>('/plan-item', body)
    const nieuweId = res?.id ?? ctx.bouw7Id
    if (!nieuweId) return

    await db()
      .from('planning_items')
      .update({ bouw7_id: String(nieuweId), bouw7_laatst_sync: new Date().toISOString() })
      .eq('id', itemId)
  } catch (e) {
    console.error('[plan-item-write] wegschrijven planitem mislukt:', e)
  }
}

/**
 * Verwijder het bijbehorende Bouw7 plan-item. Aanroepen vóór de EVA-rij weg is, want
 * daarna is de `bouw7_id` niet meer op te halen.
 */
export async function verwijderPlanItemInBouw7(bouw7Id: string | null): Promise<void> {
  if (!bouw7Id) return
  try {
    const client = await getBouw7ClientOfNull()
    if (!client) return
    await client.del('/plan-item', { id: Number(bouw7Id) })
  } catch (e) {
    console.error('[plan-item-write] verwijderen planitem mislukt:', e)
  }
}

/**
 * De Bouw7 plan-item-ids die door EVA zijn aangemaakt, voor één dossier.
 *
 * De lees-sync moet deze overslaan. Zonder die filter komt elk door EVA aangemaakt item
 * via de volgende sync terug als bron='bouw7'-rij náást het origineel: de gebruiker ziet
 * zijn planning dan dubbel, en de herbouw ruimt de EVA-rij niet op omdat die bron='eva' is.
 */
export async function evaEigenPlanItemIds(dossierId: string): Promise<Set<number>> {
  const { data } = await db()
    .from('planning_items')
    .select('bouw7_id, planning_activiteiten!activiteit_id ( dossier_id )')
    .eq('bron', 'eva')
    .not('bouw7_id', 'is', null)

  const ids = new Set<number>()
  for (const r of (data ?? []) as { bouw7_id: string; planning_activiteiten?: { dossier_id?: string } }[]) {
    if (r.planning_activiteiten?.dossier_id !== dossierId) continue
    const n = Number(r.bouw7_id)
    if (Number.isFinite(n)) ids.add(n)
  }
  return ids
}
