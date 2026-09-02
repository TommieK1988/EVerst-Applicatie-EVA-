import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { vereisPortaalOnderdeel } from './auth'
import { haalAlleRijen } from '@/lib/supabase/paginate'

/**
 * planning.ts — de planning zoals de klant hem ziet.
 *
 * DE HARDE REGEL VAN DIT BESTAND: er wordt nooit een medewerker opgehaald.
 * `planning_items` — de tabel met wie wanneer waar staat — komt hier niet voor,
 * behalve om begin- en einddatum per activiteit uit te rekenen. Er wordt dus
 * ook geen join naar `medewerkers` gelegd. Wie wanneer op de steiger staat is
 * onze bedrijfsvoering, niet de informatie waar een opdrachtgever recht op heeft.
 *
 * Om diezelfde reden blijven `onderaannemer_id` (welke partij doet dit deel),
 * `geschatte_uren`, `benodigde_skills` en `uursoort_id` buiten beeld: samen
 * vertellen die precies hoe wij het werk hebben ingekocht.
 *
 * Twee detailniveaus, per dossier in te stellen:
 *  - planning_detail = false → alleen de fases met hun periode
 *  - planning_detail = true  → ook de losse activiteiten binnen elke fase
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type PortaalActiviteit = {
  id: string
  titel: string
  start: string | null
  eind: string | null
}

export type PortaalFase = {
  naam: string
  start: string | null
  eind: string | null
  activiteiten: PortaalActiviteit[]
}

export async function getPortaalPlanning(dossierId: string): Promise<PortaalFase[]> {
  const { instellingen } = await vereisPortaalOnderdeel(dossierId, 'planning')

  const { data: activiteitenRaw } = await db()
    .from('planning_activiteiten')
    .select('id, titel, fase_id, gewenste_start, deadline, volgorde')
    .eq('dossier_id', dossierId)
    .order('volgorde', { ascending: true })

  const activiteiten = (activiteitenRaw ?? []) as Record<string, unknown>[]
  if (activiteiten.length === 0) return []

  // Werkelijke datums uit de detailplanning. Alleen start_dt/eind_dt — géén
  // medewerker_id, ook niet "even om te sorteren".
  //
  // Gepagineerd: één planitem is één medewerker op één dag, dus een project van
  // een paar maanden met een ploeg erop tikt zonder moeite over de 1000 rijen
  // waar PostgREST stil afkapt. Dan zou de laatste fase ineens korter lijken.
  const ids = activiteiten.map(a => String(a.id))
  const items = await haalAlleRijen<{ activiteit_id: string; start_dt: string; eind_dt: string }>(
    (van, tot) => db()
      .from('planning_items')
      .select('activiteit_id, start_dt, eind_dt')
      .in('activiteit_id', ids)
      .order('id')
      .range(van, tot),
  )

  const periode = new Map<string, { start: string | null; eind: string | null }>()
  for (const it of items) {
    const huidig = periode.get(it.activiteit_id) ?? { start: null, eind: null }
    if (!huidig.start || it.start_dt < huidig.start) huidig.start = it.start_dt
    if (!huidig.eind || it.eind_dt > huidig.eind) huidig.eind = it.eind_dt
    periode.set(it.activiteit_id, huidig)
  }

  const faseIds = [...new Set(activiteiten.map(a => a.fase_id).filter(Boolean))] as string[]
  const { data: fasenRaw } = faseIds.length
    ? await db().from('planning_fasen').select('id, naam, volgorde').in('id', faseIds)
    : { data: [] }
  const fasen = new Map<string, { naam: string; volgorde: number }>(
    ((fasenRaw ?? []) as { id: string; naam: string; volgorde: number }[])
      .map(f => [f.id, { naam: f.naam, volgorde: f.volgorde }]),
  )

  const perFase = new Map<string, PortaalFase & { volgorde: number }>()
  for (const a of activiteiten) {
    const faseId = (a.fase_id as string | null) ?? 'overig'
    const fase = fasen.get(faseId)
    if (!perFase.has(faseId)) {
      perFase.set(faseId, {
        naam: fase?.naam ?? 'Werkzaamheden',
        volgorde: fase?.volgorde ?? 999,
        start: null, eind: null, activiteiten: [],
      })
    }
    const bucket = perFase.get(faseId)!

    // Geplande datums gaan voor op de gewenste/deadline-velden: die laatste zijn
    // de bedoeling, de eerste is wat er echt staat.
    const gepland = periode.get(String(a.id))
    const start = gepland?.start ?? (a.gewenste_start as string | null) ?? null
    const eind = gepland?.eind ?? (a.deadline as string | null) ?? null

    if (start && (!bucket.start || start < bucket.start)) bucket.start = start
    if (eind && (!bucket.eind || eind > bucket.eind)) bucket.eind = eind

    if (instellingen.planning_detail) {
      bucket.activiteiten.push({ id: String(a.id), titel: String(a.titel ?? ''), start, eind })
    }
  }

  return [...perFase.values()]
    .sort((a, b) => a.volgorde - b.volgorde)
    .map(({ volgorde: _volgorde, ...fase }) => fase)
}
