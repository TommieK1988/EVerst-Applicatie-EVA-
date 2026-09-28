'use server'

/**
 * Eén concept-versie (calculatie + eventuele concept-offerte) verwijderen.
 *
 * Vervangt de oude knop die álle calculaties en offertes van een dossier in één keer
 * weggooide. Alleen wat nog concept is mag weg: een verzonden (definitieve) offerte
 * of een bevroren calculatie blijft altijd staan, en ook een versie waar al iets op
 * voortbouwt (werkbegroting, opdracht-onderdelen, meerwerk-regel) wordt geweigerd.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { isDossierBewerkbaar } from '@/lib/dossiers/guards'
import type { CalculatieSnapshot } from './sync'

type Resultaat = { ok: true } | { ok: false; error: string }

export async function verwijderConceptVersie(
  dossierId: string,
  projectId: string,
  scenarioId: string,
): Promise<Resultaat> {
  try {
    await vereisRecht('everts_calc', 'schrijven')
  } catch {
    return { ok: false, error: 'Je hebt geen recht om calculaties te verwijderen.' }
  }
  if (!(await isDossierBewerkbaar(dossierId))) {
    return { ok: false, error: 'Dit dossier is afgesloten en alleen-lezen.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // Het project moet echt bij dit dossier horen.
  const { data: dossier } = await db
    .from('dossiers').select('everts_calc_project_id').eq('id', dossierId).maybeSingle()
  if (dossier?.everts_calc_project_id !== projectId) {
    return { ok: false, error: 'Deze calculatie hoort niet bij dit dossier.' }
  }

  const { data: snap } = await db
    .from('calculatie_snapshots').select('data').eq('project_id', projectId).maybeSingle()
  const blob = snap?.data as CalculatieSnapshot | undefined
  const scenario = blob?.scenarios.find(s => s.id === scenarioId)
  if (!blob || !scenario) return { ok: false, error: 'Calculatie niet gevonden.' }
  if (scenario.bevroren_op) {
    return { ok: false, error: 'Deze versie is definitief en kan niet meer verwijderd worden.' }
  }

  // Offertes van deze versie: alleen concepten mogen mee weg.
  const { data: quotes } = await db
    .from('quotes').select('id, status').eq('project_id', projectId).eq('scenario_id', scenarioId)
  const quoteIds: string[] = (quotes ?? []).map((q: { id: string }) => q.id)
  if ((quotes ?? []).some((q: { status: string }) => q.status !== 'concept')) {
    return { ok: false, error: 'De offerte van deze versie is al verzonden en kan niet meer verwijderd worden.' }
  }

  // Niets mag er al op voortbouwen.
  const { count: wbCount } = await db
    .from('werkbegrotingen').select('id', { count: 'exact', head: true }).eq('scenario_id', scenarioId)
  if ((wbCount ?? 0) > 0) {
    return { ok: false, error: 'Op deze versie is al een werkbegroting gebaseerd; verwijderen kan niet.' }
  }
  if (quoteIds.length > 0) {
    for (const tabel of ['opdracht_onderdelen', 'meerwerk_regels'] as const) {
      const { count } = await db
        .from(tabel).select('id', { count: 'exact', head: true }).in('quote_id', quoteIds)
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          error: tabel === 'meerwerk_regels'
            ? 'De offerte van deze versie hangt aan een meerwerkpost; verwijderen kan niet.'
            : 'De offerte van deze versie is al in de opdracht verwerkt; verwijderen kan niet.',
        }
      }
    }
  }

  // Offertes eerst (secties, regels, bijlagen e.d. gaan via ON DELETE CASCADE mee).
  if (quoteIds.length > 0) {
    const { error } = await db.from('quotes').delete().in('id', quoteIds)
    if (error) return { ok: false, error: `Offerte verwijderen mislukt: ${error.message}` }
  }
  await db.from('calculatie_bijlagen').delete().eq('scenario_id', scenarioId)

  // Dan de calculatie uit de gedeelde blob (read-modify-write, zoals bij bevriezen).
  const groepIds = new Set(blob.groepen.filter(g => g.scenario_id === scenarioId).map(g => g.id))
  const regelIds = new Set(blob.regels.filter(r => groepIds.has(r.groep_id)).map(r => r.id))
  let scenarios = blob.scenarios.filter(s => s.id !== scenarioId)
  // Was dit de standaardversie, dan neemt de eerste overgebleven contractversie het over.
  if (scenario.is_standaard && !scenarios.some(s => s.is_standaard)) {
    const opvolger = scenarios.find(s => !s.meerwerk_regel_id)
    if (opvolger) scenarios = scenarios.map(s => s.id === opvolger.id ? { ...s, is_standaard: true } : s)
  }
  const { error: blobFout } = await db
    .from('calculatie_snapshots')
    .update({
      data: {
        ...blob,
        scenarios,
        groepen: blob.groepen.filter(g => !groepIds.has(g.id)),
        regels: blob.regels.filter(r => !regelIds.has(r.id)),
        componenten: blob.componenten.filter(c => !regelIds.has(c.calculatieregel_id)),
      },
      bijgewerkt_op: new Date().toISOString(),
    })
    .eq('project_id', projectId)
  if (blobFout) return { ok: false, error: `Calculatie verwijderen mislukt: ${blobFout.message}` }

  revalidatePath(`/opdrachten/${dossierId}/calculatie`)
  revalidatePath(`/offertes/${dossierId}/calculatie`)
  revalidatePath(`/aanvragen/${dossierId}/calculatie`)
  revalidatePath(`/servicedesk/${dossierId}/calculatie`)
  return { ok: true }
}
