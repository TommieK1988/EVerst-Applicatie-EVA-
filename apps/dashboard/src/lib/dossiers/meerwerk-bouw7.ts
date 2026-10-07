// Meerwerkregel ↔ Bouw7 (POST /project/{id}/additional-work-line, Heimdall).
// Bewust géén 'use server': deze functies hebben geen sessiegate (het akkoord van een opdrachtgever
// in het portaal en de sync-cron komen hier ook langs) en mogen dus geen publiek endpoint zijn.
// Aanroepers: meerwerk.ts (toevoegen/bewerken/status), opdracht-onderdelen.ts (stelposten) en de
// Bouw7-sync (inhaalslag).

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { MeerwerkRegel, MeerwerkStatus } from '@everts/database'
import { ververSnapshotsNaSchrijven } from '@/lib/bouw7/snapshot'
import { bouw7VoorDossier } from './actions'
import { getDossierMeerwerk } from './meerwerk'

const rond = (n: number): number => Math.round(n * 100) / 100
// Ongetypeerde admin-client, net als de rest van de meerwerk-code; één cast voor het hele bestand.
const admin = () => createAdminClient() as any

/** EVA-status → Bouw7-meerwerkstatus. */
const EVA_STATUS_NAAR_BOUW7: Record<MeerwerkStatus, number> = {
  aangevraagd: 0,        // Geregistreerd
  offerte_verstuurd: 0,  // (geen Bouw7-equivalent) → Geregistreerd
  akkoord: 1,            // Akkoord
  afgewezen: 2,          // Niet akkoord
  voltooid: 3,           // Opgeleverd
}

/**
 * Bouwt de Bouw7 additional-work-line-body uit een EVA-regel. `executor` (Aangevraagd door) = de
 * Bouw7-klant van het dossier; ontbreekt die, dan wordt het veld weggelaten (leeg in Bouw7).
 * `id` wordt door de aanroeper toegevoegd bij een update.
 */
async function bouwBouw7MeerwerkBody(regel: MeerwerkRegel): Promise<Record<string, unknown>> {
  const executorId = await executorVoorDossier(regel.dossier_id)

  const mw = await getDossierMeerwerk(regel.dossier_id)
  const view = mw.regels.find(r => r.id === regel.id)
  const verkoop = rond(view?.effectiefExcl ?? (Number(regel.bedrag_excl_btw) || 0))
  const begroot = rond(regel.begroot_bedrag != null ? Number(regel.begroot_bedrag) : 0)

  const body: Record<string, unknown> = {
    description: regel.omschrijving,
    cost: String(verkoop),
    budgetAmount: String(begroot),
    date: (regel.created_at ? String(regel.created_at) : new Date().toISOString()).slice(0, 10),
    // Bouw7 valideert `note` als NotBlank (leeg/ontbrekend => 400). Zonder factuurreferentie
    // vullen we daarom de omschrijving in.
    note: regel.factuurreferentie?.trim() || regel.omschrijving?.trim() || 'Meerwerk',
    status: EVA_STATUS_NAAR_BOUW7[regel.status] ?? 0,
    isProvisional: !!regel.is_stelpost,
  }
  if (executorId) body.executor = { id: Number(executorId) }
  return body
}

/** Bouw7-klant van het dossier = "Aangevraagd door" op de meerwerkregel. */
async function executorVoorDossier(dossierId: string): Promise<string | null> {
  const { data: dossier } = await admin()
    .from('dossiers')
    .select('klant:relaties(bouw7_id)')
    .eq('id', dossierId)
    .single()
  return dossier?.klant?.bouw7_id ?? null
}

export type Bouw7AanmaakResultaat = { ok: true; nummer: string | null } | { ok: false; error: string }

/**
 * Schrijft een EVA-meerwerkregel als echte meerwerkregel naar Bouw7 (upsert; `id` weggelaten =
 * create). Na aanmaken worden het Bouw7-id + MW-nummer op de EVA-regel vastgelegd (en de
 * bronsleutel, tegen dubbele import). Regels die al aan een Bouw7-regel hangen worden overgeslagen;
 * een dossier zonder Bouw7-project is geen fout.
 */
export async function maakMeerwerkInBouw7(regelId: string): Promise<Bouw7AanmaakResultaat> {
  const supabase = admin()
  const { data: regel } = await supabase.from('meerwerk_regels').select('*').eq('id', regelId).single()
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
  if (regel.bouw7_line_id) return { ok: true, nummer: regel.bouw7_nummer ?? null }

  const ctx = await bouw7VoorDossier(regel.dossier_id)
  if (!ctx) return { ok: true, nummer: null }
  const { client, bouw7Id } = ctx

  const body = await bouwBouw7MeerwerkBody(regel as MeerwerkRegel)

  let created: { id?: number; number?: string }
  try {
    created = await client.post<{ id?: number; number?: string }>(`/project/${bouw7Id}/additional-work-line`, body)
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Aanmaken in Bouw7 mislukt.'
    // Zonder deze regel bestond de fout alleen als toast bij de gebruiker en was hij achteraf onvindbaar.
    console.error(`[meerwerk → Bouw7] aanmaken regel ${regelId} (project ${bouw7Id}) mislukt:`, error)
    return { ok: false, error }
  }
  if (!created?.id) return { ok: false, error: 'Bouw7 gaf geen meerwerkregel-id terug.' }

  await supabase
    .from('meerwerk_regels')
    .update({
      bouw7_line_id: created.id,
      bouw7_nummer: created.number ?? null,
      bouw7_bron_sleutel: `line:${created.id}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', regelId)

  // De regel bestaat nu ook in Bouw7 en telt daar mee in de projectcijfers.
  if (regel.dossier_id) {
    await ververSnapshotsNaSchrijven(regel.dossier_id, ['athena_control'], ['athena_financial'])
  }
  try { revalidatePath(`/opdrachten/${regel.dossier_id}/meerwerk`) } catch { /* buiten request-scope (cron) */ }
  return { ok: true, nummer: created.number ?? null }
}

/**
 * Werkt een al aan Bouw7 gekoppelde meerwerkregel bij (zelfde POST-endpoint mét `id` = update in het
 * Bouw7-upsertpatroon). Gebruikt voor het terugschrijven van o.a. statuswijzigingen. Best effort.
 */
export async function updateMeerwerkInBouw7(regel: MeerwerkRegel): Promise<{ ok: boolean; error?: string }> {
  if (regel.bouw7_line_id == null) return { ok: true }
  const ctx = await bouw7VoorDossier(regel.dossier_id)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling.' }
  const body = await bouwBouw7MeerwerkBody(regel)
  body.id = regel.bouw7_line_id
  try {
    await ctx.client.post(`/project/${ctx.bouw7Id}/additional-work-line`, body)
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Bouw7-update mislukt.'
    console.error(`[meerwerk → Bouw7] bijwerken regel ${regel.id} (line ${regel.bouw7_line_id}) mislukt:`, error)
    return { ok: false, error }
  }
}

/**
 * Inhaalslag: elke EVA-eigen meerwerkregel op een Bouw7-dossier die nog geen Bouw7-regel heeft,
 * alsnog aanmaken. Vangt regels op waarvan het aanmaken bij toevoegen mislukte en regels van vóór
 * het automatisch doorzetten (6 okt 2026). Draait in de Bouw7-sync, vóór de import van Bouw7-regels,
 * zodat die import de zojuist aangemaakte regels al als gekoppeld herkent.
 */
export async function haalMeerwerkInNaarBouw7(dossierIds?: string[]): Promise<{ aangemaakt: number; fouten: number }> {
  const supabase = admin()
  // Begrensd: alleen regels zonder Bouw7-koppeling (een handvol), niet de hele tabel.
  let q = supabase.from('meerwerk_regels')
    .select('id, dossier:dossiers!inner(bouw7_id)')
    .eq('bron', 'eva')
    .is('bouw7_line_id', null)
    .not('dossier.bouw7_id', 'is', null)
    .order('created_at')
    .limit(500)
  if (dossierIds) {
    if (!dossierIds.length) return { aangemaakt: 0, fouten: 0 }
    q = q.in('dossier_id', dossierIds)
  }
  const { data, error } = await q
  if (error) {
    console.error('[meerwerk → Bouw7] inhaalslag: ophalen mislukt:', error.message)
    return { aangemaakt: 0, fouten: 1 }
  }
  let aangemaakt = 0
  let fouten = 0
  for (const r of (data ?? []) as { id: string }[]) {
    const res = await maakMeerwerkInBouw7(r.id)
    if (!res.ok) fouten++
    else if (res.nummer != null) aangemaakt++
  }

  // Stelposten buiten de aanneemsom die nog geen Bouw7-regel hebben (zelfde vangnet).
  let sq = admin().from('opdracht_onderdelen')
    .select('id, dossier:dossiers!inner(bouw7_id)')
    .eq('soort', 'stelpost').eq('in_opdracht', true).eq('in_aanneemsom', false)
    .is('bouw7_line_id', null)
    .not('dossier.bouw7_id', 'is', null)
    .order('created_at')
    .limit(500)
  if (dossierIds) sq = sq.in('dossier_id', dossierIds)
  const { data: stelposten } = await sq
  for (const r of (stelposten ?? []) as { id: string }[]) {
    const res = await zetStelpostInBouw7(r.id)
    if (!res.ok) fouten++
    else if (res.nummer != null) aangemaakt++
  }
  return { aangemaakt, fouten }
}

/**
 * Zet een stelpost als meerwerkregel met "stelpost" aangevinkt in Bouw7, of werkt die regel bij.
 *
 * Alleen een stelpost búíten de aanneemsom hoort daar: dat is extra omzet. Een stelpost ín de
 * aanneemsom (carve-out) zit al in de aanneemsom en zou in Bouw7 dubbel tellen. Bij verrekenen komt
 * alleen het verschil als eigen meerwerkregel bij, zodat stelpost + verschil = werkelijk.
 *
 * Valt een stelpost die al in Bouw7 staat er niet meer onder (uit de opdracht, naar de aanneemsom,
 * of verwijderd met `vervalt`), dan gaat de Bouw7-regel op Niet akkoord. Verwijderen kan via deze
 * API niet; Niet akkoord telt in Bouw7 niet mee.
 */
export async function zetStelpostInBouw7(
  onderdeelId: string,
  opts?: { vervalt?: boolean },
): Promise<Bouw7AanmaakResultaat> {
  const supabase = admin()
  const { data: rij } = await supabase.from('opdracht_onderdelen').select('*').eq('id', onderdeelId).maybeSingle()
  if (!rij || rij.soort !== 'stelpost') return { ok: true, nummer: null }
  const hoortErin = !opts?.vervalt && !!rij.in_opdracht && !rij.in_aanneemsom
  if (!hoortErin && rij.bouw7_line_id == null) return { ok: true, nummer: null }

  const ctx = await bouw7VoorDossier(rij.dossier_id)
  if (!ctx) return { ok: true, nummer: null }

  const executorId = await executorVoorDossier(rij.dossier_id)
  const body: Record<string, unknown> = {
    description: rij.omschrijving,
    cost: String(rond(Number(rij.bedrag_excl_btw) || 0)),
    // Kostprijs-budget, nooit het stelpostbedrag zelf: dat draagt AK en winst en zou de verwachte
    // kosten in Bouw7 opblazen.
    budgetAmount: String(rond(Number(rij.begroot_excl_btw) || 0)),
    date: String(rij.created_at ?? new Date().toISOString()).slice(0, 10),
    note: rij.bewakingscode ? `Stelpost ${rij.bewakingscode}` : 'Stelpost',
    status: hoortErin ? EVA_STATUS_NAAR_BOUW7.akkoord : EVA_STATUS_NAAR_BOUW7.afgewezen,
    isProvisional: true,
  }
  if (executorId) body.executor = { id: Number(executorId) }
  if (rij.bouw7_line_id != null) body.id = rij.bouw7_line_id

  let res: { id?: number; number?: string }
  try {
    res = await ctx.client.post<{ id?: number; number?: string }>(`/project/${ctx.bouw7Id}/additional-work-line`, body)
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Stelpost naar Bouw7 mislukt.'
    console.error(`[stelpost → Bouw7] onderdeel ${onderdeelId} (project ${ctx.bouw7Id}) mislukt:`, error)
    return { ok: false, error }
  }

  if (rij.bouw7_line_id == null) {
    if (!res?.id) return { ok: false, error: 'Bouw7 gaf geen meerwerkregel-id terug.' }
    await supabase.from('opdracht_onderdelen')
      .update({ bouw7_line_id: res.id, bouw7_nummer: res.number ?? null })
      .eq('id', onderdeelId)
  }
  await ververSnapshotsNaSchrijven(rij.dossier_id, ['athena_control'], ['athena_financial'])
  return { ok: true, nummer: res?.number ?? rij.bouw7_nummer ?? null }
}
