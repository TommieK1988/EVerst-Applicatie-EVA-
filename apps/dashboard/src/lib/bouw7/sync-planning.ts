'use server'

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client, logSync, type SyncResult } from './sync'
import type { Bouw7PlanItem, Bouw7EmployeeRef } from './client'

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

/** Plan-items van één Bouw7-project (alle pagina's). */
export async function fetchPlanItems(projectId: string): Promise<Bouw7PlanItem[]> {
  const client = await getBouw7Client()
  return client.getApolloAll<Bouw7PlanItem>('/search/plan-items', `project.id = ${projectId}`)
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
 * planning_activiteiten (Taak), assignedEmployees → planning_items (per medewerker).
 * Rijen met bron='bouw7' worden volledig herbouwd; bron='eva'-rijen blijven ongemoeid.
 */
export async function syncDossierPlanning(dossierId: string): Promise<SyncResult> {
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0 }
  const supabase = db()

  try {
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id, bouw7_id')
      .eq('id', dossierId)
      .single()

    const bouw7Id = dossier?.bouw7_id
    if (!bouw7Id) return result // dossier zonder Bouw7-koppeling → niets te syncen

    const planItems = await fetchPlanItems(String(bouw7Id))
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
    // (In de huidige Everts-data altijd leeg, maar voorbereid op koppeling later.)
    const empMap = await resolveMedewerkers(supabase, planItems, nu)

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
      const omschrijving = crew ? (pi.project?.name ?? null) : null

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
      const emps = pi.assignedEmployees ?? []
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

    return result
  } catch (e: unknown) {
    result.fouten++
    result.foutMelding = e instanceof Error ? e.message : 'Planning-sync mislukt'
    return result
  } finally {
    await logSync('planning', 'in', result, Date.now() - start)
  }
}

/**
 * Zorg dat elke door een plan-item toegewezen medewerker een EVA-record heeft.
 * Onbekende medewerkers krijgen een stub (zoals syncProjects voor rollen doet).
 * Geeft een map terug van Bouw7-employee-id → EVA medewerker-uuid.
 */
async function resolveMedewerkers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  planItems: Bouw7PlanItem[],
  nu: string,
): Promise<Map<string, string>> {
  const empMap = new Map<string, string>()
  const alleEmps = new Map<string, Bouw7EmployeeRef>()
  for (const pi of planItems) {
    for (const emp of pi.assignedEmployees ?? []) {
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
        voornaam: emp.givenName ?? '',
        achternaam: emp.familyName ?? '',
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
export async function syncAllPlanning(): Promise<SyncResult> {
  const start = Date.now()
  const totaal: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0 }
  const supabase = db()

  try {
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('id')
      .not('bouw7_id', 'is', null)

    for (const d of (dossiers ?? []) as { id: string }[]) {
      const r = await syncDossierPlanning(d.id)
      totaal.nieuw += r.nieuw
      totaal.bijgewerkt += r.bijgewerkt
      totaal.fouten += r.fouten
    }
    return totaal
  } catch (e: unknown) {
    totaal.fouten++
    totaal.foutMelding = e instanceof Error ? e.message : 'Planning-bulk-sync mislukt'
    return totaal
  } finally {
    // Per-dossier sync logt al; hier een samenvattende regel.
    await logSync('planning', 'in', totaal, Date.now() - start)
  }
}
