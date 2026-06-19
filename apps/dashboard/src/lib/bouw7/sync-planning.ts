'use server'

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client, logSync, type SyncResult, type SyncMode } from './sync'
import { fingerprint } from './fingerprint'
import type { Bouw7Client, Bouw7PlanItem, Bouw7PlanItemDetail, Bouw7PlanItemEmployee } from './client'

// De gegenereerde Supabase-types lopen achter op de nieuwe bron/bouw7_id-kolommen;
// admin-client als any zoals elders in de planning-module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const ALGEMEEN_KEY = 'chapter:algemeen'

/** "2026-02-23 07:00:00" → "2026-02-23" (date-kolom). */
function toDate(dt?: string | null): string | null {
  if (!dt) return null
  return dt.slice(0, 10)
}

/** "2026-02-23 07:00:00" → "2026-02-23T07:00:00" (timestamptz-kolom). */
function toTimestamp(dt?: string | null): string | null {
  if (!dt) return null
  return dt.replace(' ', 'T')
}

/** Plan-items van één Bouw7-project (alle pagina's, via Apollo-search). */
export async function fetchPlanItems(projectId: string, client?: Bouw7Client): Promise<Bouw7PlanItem[]> {
  const c = client ?? (await getBouw7Client())
  return c.getApolloAll<Bouw7PlanItem>('/search/plan-items', `project.id = ${projectId}`)
}

/** Aantal plan-item-details dat tegelijk wordt opgehaald. */
const DETAIL_BATCH = 10

/**
 * Haal per plan-item het Heimdall-detail (`/plan-item/{id}`) op — de enige plek waar de
 * toegewezen `employees[]` staan; de Apollo-search levert die niet. Gebatcht (Promise.allSettled),
 * net als de Athena-/offerte-calls in syncProjects. Geeft een map plan-item-id → detail.
 */
export async function fetchPlanItemDetails(
  ids: number[],
  client: Bouw7Client,
): Promise<Map<number, Bouw7PlanItemDetail>> {
  const map = new Map<number, Bouw7PlanItemDetail>()
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    const batch = ids.slice(i, i + DETAIL_BATCH)
    const results = await Promise.allSettled(
      batch.map(id => client.get<Bouw7PlanItemDetail>(`/plan-item/${id}`)),
    )
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) map.set(batch[j], r.value)
    })
  }
  return map
}

/** Een plan-item zonder bewakingscode + met dezelfde naam als het project = crewblok. */
function isCrewblok(pi: Bouw7PlanItem): boolean {
  return !pi.securityPlanningLink?.securityCode?.chapter?.id
}

/** Stabiele fase-sleutel (bouw7_id) per plan-item. */
function faseKeyVan(pi: Bouw7PlanItem): string {
  const chap = pi.securityPlanningLink?.securityCode?.chapter
  return chap?.id ? `chapter:${chap.id}` : ALGEMEEN_KEY
}

/**
 * Synchroniseer de Bouw7-planning (plan-items) van één dossier naar EVA.
 *
 * Mapping: bewakingscode-chapter → planning_fasen (Hoofdtaak), plan-item →
 * planning_activiteiten (Taak), toegewezen medewerkers (uit het detail-endpoint) →
 * planning_items (per medewerker).
 * Rijen met bron='bouw7' worden volledig herbouwd; bron='eva'-rijen blijven ongemoeid.
 */
export async function syncDossierPlanning(
  dossierId: string,
  opts?: { mode?: SyncMode; client?: Bouw7Client; planItems?: Bouw7PlanItem[]; silent?: boolean },
): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const supabase = db()

  try {
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, bouw7_planning_hash')
      .eq('id', dossierId)
      .single()

    const bouw7Id = dossier?.bouw7_id
    if (!bouw7Id) return result // dossier zonder Bouw7-koppeling → niets te syncen

    const client = opts?.client ?? (await getBouw7Client())
    const planItems = opts?.planItems ?? (await fetchPlanItems(String(bouw7Id), client))

    // Planning-fingerprint uit de goedkope Apollo-lijst (id/updatedAt/uren/datums/naam/chapter/remark).
    // Is die gelijk aan de opgeslagen hash → de dure /plan-item/{id} detail-calls + rebuild overslaan.
    const planningHash = fingerprint(
      planItems
        .map(pi => ({
          id:  pi.id,
          upd: pi.updatedAt ?? null,
          h:   pi.hours ?? null,
          s:   pi.startDate ?? null,
          e:   pi.endDate ?? null,
          nm:  pi.name ?? null,
          ch:  pi.securityPlanningLink?.securityCode?.chapter?.id ?? null,
          rm:  pi.remark ?? null,
          dep: pi.department?.name ?? null,
        }))
        .sort((a, b) => a.id - b.id),
    )
    if (mode !== 'full' && dossier.bouw7_planning_hash === planningHash) {
      result.overgeslagen = 1
      return result
    }

    // De toegewezen medewerkers staan alleen in het detail-endpoint, niet in de search-response.
    const detailMap = await fetchPlanItemDetails(planItems.map(pi => pi.id), client)
    const nu = new Date().toISOString()

    // ── 1. Fasen (Hoofdtaken) ────────────────────────────────────────
    // Verzamel benodigde fasen uit de bewakingscode-chapters; crewblokken → "Algemeen".
    const benodigdeFasen = new Map<string, { naam: string; volgorde: number }>()
    let volg = 0
    for (const pi of planItems) {
      const key = faseKeyVan(pi)
      if (benodigdeFasen.has(key)) continue
      if (key === ALGEMEEN_KEY) {
        benodigdeFasen.set(key, { naam: 'Algemeen', volgorde: 999 })
      } else {
        const chap = pi.securityPlanningLink!.securityCode!.chapter!
        benodigdeFasen.set(key, { naam: chap.name?.trim() || `Hoofdtaak ${chap.id}`, volgorde: volg++ })
      }
    }

    // Bestaande Bouw7-fasen van dit dossier ophalen.
    const { data: bestaandeFasen } = await supabase
      .from('planning_fasen')
      .select('id, bouw7_id, naam, volgorde')
      .eq('dossier_id', dossierId)
      .eq('bron', 'bouw7')

    const faseMap = new Map<string, string>() // bouw7_id → fase uuid
    for (const f of (bestaandeFasen ?? []) as { id: string; bouw7_id: string }[]) {
      faseMap.set(f.bouw7_id, f.id)
    }

    // Insert ontbrekende fasen, update naam/volgorde van bestaande.
    const nieuweFaseRows: Record<string, unknown>[] = []
    for (const [key, def] of benodigdeFasen) {
      if (faseMap.has(key)) {
        await supabase
          .from('planning_fasen')
          .update({ naam: def.naam, volgorde: def.volgorde, bouw7_laatst_sync: nu })
          .eq('id', faseMap.get(key))
      } else {
        nieuweFaseRows.push({
          dossier_id: dossierId,
          naam: def.naam,
          volgorde: def.volgorde,
          bron: 'bouw7',
          bouw7_id: key,
          bouw7_laatst_sync: nu,
        })
      }
    }
    if (nieuweFaseRows.length > 0) {
      const { data: ingevoegd } = await supabase
        .from('planning_fasen')
        .insert(nieuweFaseRows)
        .select('id, bouw7_id')
      for (const f of (ingevoegd ?? []) as { id: string; bouw7_id: string }[]) faseMap.set(f.bouw7_id, f.id)
    }

    // Stale Bouw7-fasen opruimen (chapters die niet meer voorkomen).
    const staleFaseIds = ((bestaandeFasen ?? []) as { id: string; bouw7_id: string }[])
      .filter(f => !benodigdeFasen.has(f.bouw7_id))
      .map(f => f.id)
    if (staleFaseIds.length > 0) {
      await supabase.from('planning_fasen').delete().in('id', staleFaseIds)
    }

    // ── 2. Medewerker-stubs voor toegewezen medewerkers ───────────────
    // De toewijzingen komen uit de plan-item-details (Apollo-search levert ze niet).
    const empMap = await resolveMedewerkers(supabase, [...detailMap.values()], nu)

    // ── 3. Activiteiten (Taken) volledig herbouwen ────────────────────
    // Bestaande Bouw7-activiteiten verwijderen → planning_items cascaden mee.
    await supabase
      .from('planning_activiteiten')
      .delete()
      .eq('dossier_id', dossierId)
      .eq('bron', 'bouw7')

    let activiteitVolg = 0
    for (const pi of planItems) {
      const crew = isCrewblok(pi)
      const titel = crew
        ? (pi.department?.name?.trim() || pi.name?.trim() || 'Planning')
        : (pi.name?.trim() || 'Taak')
      // Opmerking van het plan-item (search-veld `remark`, anders detail-`notes`).
      const remark = (pi.remark ?? detailMap.get(pi.id)?.notes)?.trim() || null
      const omschrijving = crew ? (pi.project?.name ?? remark) : remark

      const { data: act, error: actErr } = await supabase
        .from('planning_activiteiten')
        .insert({
          dossier_id: dossierId,
          fase_id: faseMap.get(faseKeyVan(pi)) ?? null,
          titel,
          omschrijving,
          geschatte_uren: pi.hours ?? null,
          gewenste_start: toDate(pi.startDate),
          deadline: toDate(pi.endDate),
          status: 'gepland',
          volgorde: activiteitVolg++,
          bron: 'bouw7',
          bouw7_id: String(pi.id),
          bouw7_laatst_sync: nu,
        })
        .select('id')
        .single()

      if (actErr || !act) {
        result.fouten++
        continue
      }
      result.nieuw++

      // ── 4. Planitems per toegewezen medewerker ──────────────────────
      const emps = detailMap.get(pi.id)?.employees ?? []
      const itemRows: Record<string, unknown>[] = []
      for (const emp of emps) {
        const medewerkerId = empMap.get(String(emp.id))
        if (!medewerkerId) {
          result.fouten++
          continue
        }
        itemRows.push({
          activiteit_id: act.id,
          medewerker_id: medewerkerId,
          start_dt: toTimestamp(pi.startDate),
          eind_dt: toTimestamp(pi.endDate),
          uren: pi.hours ?? 0,
          bron: 'bouw7',
          bouw7_id: `${pi.id}:${emp.id}`,
          bouw7_laatst_sync: nu,
        })
      }
      if (itemRows.length > 0) {
        await supabase.from('planning_items').insert(itemRows)
      }
    }

    // Sla de nieuwe planning-fingerprint op zodat een volgende incrementele sync dit dossier overslaat.
    await supabase.from('dossiers').update({ bouw7_planning_hash: planningHash }).eq('id', dossierId)

    return result
  } catch (e: unknown) {
    result.fouten++
    result.foutMelding = e instanceof Error ? e.message : 'Planning-sync mislukt'
    return result
  } finally {
    // Bij bulk-sync (syncAllPlanning) logt de aanroeper een samenvatting; per-dossier loggen zou de
    // sync_log overspoelen. Een losse aanroep (ververs-knop) logt wél.
    if (!opts?.silent) await logSync('planning', 'in', result, Date.now() - start)
  }
}

/**
 * Zorg dat elke aan een plan-item toegewezen medewerker een EVA-record heeft.
 * Onbekende medewerkers krijgen een stub (zoals syncProjects voor rollen doet).
 * Geeft een map terug van Bouw7-employee-id → EVA medewerker-uuid.
 *
 * NB: de detail-employees gebruiken `firstName`/`lastName` (niet `givenName`/`familyName`).
 */
async function resolveMedewerkers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  details: Bouw7PlanItemDetail[],
  nu: string,
): Promise<Map<string, string>> {
  const empMap = new Map<string, string>()
  const alleEmps = new Map<string, Bouw7PlanItemEmployee>()
  for (const det of details) {
    for (const emp of det.employees ?? []) {
      if (emp?.id) alleEmps.set(String(emp.id), emp)
    }
  }
  if (alleEmps.size === 0) return empMap

  const ids = [...alleEmps.keys()]
  const { data: bestaand } = await supabase
    .from('medewerkers')
    .select('id, bouw7_id')
    .in('bouw7_id', ids)
  for (const m of (bestaand ?? []) as { id: string; bouw7_id: string }[]) empMap.set(m.bouw7_id, m.id)

  const stubs = ids
    .filter(id => !empMap.has(id))
    .map(id => {
      const emp = alleEmps.get(id)!
      return {
        voornaam: emp.firstName ?? '',
        achternaam: emp.lastName ?? '',
        extern: false,
        actief: true,
        bouw7_id: id,
        bouw7_laatst_sync: nu,
        bouw7_sync_status: 'synced',
      }
    })
  if (stubs.length > 0) {
    // medewerkers heeft een volledige unique constraint op bouw7_id → upsert mag.
    await supabase.from('medewerkers').upsert(stubs, { onConflict: 'bouw7_id' })
    const { data: med2 } = await supabase
      .from('medewerkers')
      .select('id, bouw7_id')
      .in('bouw7_id', stubs.map(s => s.bouw7_id))
    for (const m of (med2 ?? []) as { id: string; bouw7_id: string }[]) empMap.set(m.bouw7_id, m.id)
  }
  return empMap
}

/**
 * Synchroniseer de planning van alle dossiers met een Bouw7-koppeling.
 * Bedoeld om mee te liften op de volledige sync (runFullSync).
 */
export async function syncAllPlanning(opts?: { mode?: SyncMode }): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const start = Date.now()
  const totaal: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const supabase = db()

  try {
    // Scope: planning bestaat in Bouw7 alleen voor dossiers in uitvoering. Aanvraag/offerte-dossiers
    // hebben geen plan-items, dus die slaan we volledig over (geen Apollo-call). Binnen de scope zorgt
    // de planning-hash dat ongewijzigde dossiers de dure detail-calls overslaan.
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('id')
      .not('bouw7_id', 'is', null)
      .in('hoofdstatus', ['opdracht', 'servicedesk'])

    // Eén gedeelde client → niet per dossier opnieuw inloggen bij Bouw7.
    const client = await getBouw7Client()

    for (const d of (dossiers ?? []) as { id: string }[]) {
      const r = await syncDossierPlanning(d.id, { mode, client, silent: true })
      totaal.nieuw += r.nieuw
      totaal.bijgewerkt += r.bijgewerkt
      totaal.fouten += r.fouten
      totaal.overgeslagen = (totaal.overgeslagen ?? 0) + (r.overgeslagen ?? 0)
    }
    return totaal
  } catch (e: unknown) {
    totaal.fouten++
    totaal.foutMelding = e instanceof Error ? e.message : 'Planning-bulk-sync mislukt'
    return totaal
  } finally {
    // Per-dossier sync is stil; hier één samenvattende regel.
    await logSync('planning', 'in', totaal, Date.now() - start)
  }
}
