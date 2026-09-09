'use server'

/**
 * Uitvragen bij onderaannemers en leveranciers, per dossier.
 *
 * Waar de calculator vroeger in zijn eigen mailbox moest zoeken bij wie hij een prijs had opgevraagd,
 * staat dat nu op het dossier: welke discipline, welke partij, wanneer uitgevraagd, wanneer terug.
 * `status = 'open'` mét een `aangevraagd_op` is de definitie van "staat extern uit" — dat voedt zowel
 * het openstaande-overzicht als de rappelmails.
 *
 * Patroon gelijk aan `lib/dossiers/meerwerk.ts`: admin-client, per mutatie `vereisSessie()` +
 * `assertDossierBewerkbaar()`, en een `{ ok }`-resultaat in plaats van een throw.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { UITVRAAG_TRANSITIES } from '@everts/database'
import type { DossierUitvraag, UitvraagStatus, UitvraagSoort } from '@everts/database'
import { vereisSessie, getCurrentMedewerker } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'

export type ActieResultaat = { ok: true } | { ok: false; error: string }

export type UitvraagView = DossierUitvraag & {
  /** Dagen sinds `aangevraagd_op`; null zolang er niet is uitgevraagd. */
  dagen_open: number | null
  /** True als de uiterlijke reactiedatum verstreken is en de regel nog openstaat. */
  te_laat: boolean
  /** True als de gekoppelde relatie is gedeactiveerd (of verdwenen). */
  partij_inactief: boolean
  /** Algemeen mailadres van de relatie; leeg = niet automatisch mailbaar. */
  partij_email: string | null
}

/* ─── datum-hulpjes ───────────────────────────────────────────────── */

/** Vandaag als YYYY-MM-DD in lokale tijd. Nooit toISOString: dat schuift 's avonds een dag terug. */
function vandaagISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Hele dagen tussen twee kale datums. Bewust op datum-niveau rekenen en niet met milliseconden:
 * anders verspringt "dagen open" rond middernacht en bij een zomertijdovergang met één dag.
 */
function dagenTussen(vanISO: string, totISO: string): number {
  const [jv, mv, dv] = vanISO.split('-').map(Number)
  const [jt, mt, dt] = totISO.split('-').map(Number)
  return Math.round((Date.UTC(jt, mt - 1, dt) - Date.UTC(jv, mv - 1, dv)) / 86_400_000)
}

/**
 * De tab leeft op drie routes (aanvraag/offerte/opdracht) en een dossier wisselt van sectie zonder
 * van id te veranderen. Eén hard pad zou dus na een statuswissel de verkeerde cache verversen —
 * vandaar alle drie.
 */
function ververs(dossierId: string): void {
  for (const sectie of ['aanvragen', 'offertes', 'opdrachten']) {
    revalidatePath(`/${sectie}/${dossierId}/uitvraag`)
  }
}

/* ─── lezen ───────────────────────────────────────────────────────── */

/**
 * Alle uitvragen van één dossier. Begrensd door `dossier_id`, dus ruim onder de PostgREST-grens van
 * 1000 rijen; paginering is hier niet nodig.
 */
export async function getDossierUitvragen(dossierId: string): Promise<UitvraagView[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data, error } = await db
    .from('dossier_uitvragen')
    .select('*, relaties(id, naam, email, actief)')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: true })
  if (error || !data) return []

  const vandaag = vandaagISO()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(r => ({
    ...r,
    dagen_open: r.aangevraagd_op ? dagenTussen(r.aangevraagd_op, vandaag) : null,
    te_laat: r.status === 'open' && !!r.reactie_uiterlijk && r.reactie_uiterlijk < vandaag,
    // Een losgekoppelde relatie (relatie_id op null) telt ook als "niet meer bruikbaar".
    partij_inactief: r.relatie_id ? r.relaties?.actief === false : true,
    partij_email: r.relaties?.email ?? null,
  })) as UitvraagView[]
}

/**
 * Eerder gebruikte disciplines, als suggestielijst onder het invoerveld. Discipline is bewust vrije
 * tekst; deze lijst laat collega's vanzelf dezelfde woorden kiezen zonder dat er stamdata beheerd
 * hoeft te worden.
 *
 * Expliciet begrensd op de laatste 500 rijen: een lijst over de hele tabel zou meegroeien en
 * uiteindelijk stil worden afgekapt.
 */
export async function getDisciplineSuggesties(): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('dossier_uitvragen')
    .select('discipline')
    .order('created_at', { ascending: false })
    .limit(500)

  const gezien = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((data ?? []) as any[])) {
    const d = (r.discipline ?? '').trim()
    if (d) gezien.add(d)
  }
  return [...gezien].sort((a, b) => a.localeCompare(b, 'nl'))
}

/* ─── muteren ─────────────────────────────────────────────────────── */

export type NieuweUitvraag = {
  discipline: string
  soort: UitvraagSoort
  relatie_id: string | null
  partij_naam: string
  reactie_uiterlijk?: string | null
  opmerking?: string | null
}

export async function maakUitvraag(
  dossierId: string,
  data: NieuweUitvraag,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // Muterende actie op de admin-client: zonder deze gate is dit een publiek aanroepbaar endpoint voor
  // iedereen met een sessie. vereisSessie en niet vereisRecht('dossiers'): die module staat niet in
  // AFGEDWONGEN_MODULES, dus een rechtencheck zou collega's buitensluiten die dat recht nooit
  // expliciet hebben gekregen. Zelfde afweging als in meerwerk.ts.
  await vereisSessie()
  await assertDossierBewerkbaar(dossierId)

  const discipline = data.discipline.trim()
  const partijNaam = data.partij_naam.trim()
  if (!discipline) return { ok: false, error: 'Vul een discipline in.' }
  if (!partijNaam)  return { ok: false, error: 'Kies een partij.' }

  const medewerker = await getCurrentMedewerker().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data: maxRow } = await db
    .from('dossier_uitvragen')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()

  // `aangevraagd_op` blijft bewust leeg: die wordt gezet zodra de mail daadwerkelijk weg is (of de
  // gebruiker vult hem zelf in na een telefonische uitvraag). Zo belandt een regel die nog nergens
  // ligt niet in het rappel-overzicht.
  const { data: ins, error } = await db
    .from('dossier_uitvragen')
    .insert({
      dossier_id: dossierId,
      volgnummer: (maxRow?.volgnummer ?? 0) + 1,
      discipline,
      soort: data.soort,
      relatie_id: data.relatie_id,
      partij_naam: partijNaam,
      reactie_uiterlijk: data.reactie_uiterlijk ?? null,
      opmerking: data.opmerking ?? null,
      created_by: medewerker?.id ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  ververs(dossierId)
  return { ok: true, id: ins.id }
}

export type UitvraagPatch = {
  discipline?: string
  soort?: UitvraagSoort
  aangevraagd_op?: string | null
  ontvangen_op?: string | null
  reactie_uiterlijk?: string | null
  opmerking?: string | null
}

/**
 * Eén regel bijwerken. Houdt datum en status bij elkaar: een ingevulde ontvangstdatum betekent dat de
 * offerte binnen is, en dan hoort de regel niet meer als openstaand te gelden. Zonder die koppeling
 * zou iemand de datum invullen en tóch een rappel krijgen.
 */
export async function updateUitvraag(id: string, patch: UitvraagPatch): Promise<ActieResultaat> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: rij } = await db
    .from('dossier_uitvragen')
    .select('dossier_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Uitvraag niet gevonden.' }
  await assertDossierBewerkbaar(rij.dossier_id)

  if (patch.discipline !== undefined && !patch.discipline.trim()) {
    return { ok: false, error: 'Vul een discipline in.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const velden: Record<string, any> = { ...patch, updated_at: new Date().toISOString() }
  if (patch.discipline !== undefined) velden.discipline = patch.discipline.trim()

  const status = rij.status as UitvraagStatus
  if (patch.ontvangen_op !== undefined) {
    if (patch.ontvangen_op && status === 'open') velden.status = 'ontvangen'
    // Datum weer weggehaald → de offerte is er toch niet; terug naar openstaand.
    if (!patch.ontvangen_op && status === 'ontvangen') velden.status = 'open'
  }

  const { error } = await db.from('dossier_uitvragen').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }
  ververs(rij.dossier_id)
  return { ok: true }
}

export async function setUitvraagStatus(id: string, nieuw: UitvraagStatus): Promise<ActieResultaat> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: rij } = await db
    .from('dossier_uitvragen')
    .select('dossier_id, status, ontvangen_op')
    .eq('id', id)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Uitvraag niet gevonden.' }
  await assertDossierBewerkbaar(rij.dossier_id)

  const huidig = rij.status as UitvraagStatus
  if (huidig === nieuw) return { ok: true }
  if (!UITVRAAG_TRANSITIES[huidig]?.includes(nieuw)) {
    return { ok: false, error: `Van "${huidig}" kan niet naar "${nieuw}".` }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const velden: Record<string, any> = { status: nieuw, updated_at: new Date().toISOString() }
  // Ontvangen zonder datum is een half ingevulde regel; vul hem aan in plaats van erom te vragen.
  if ((nieuw === 'ontvangen' || nieuw === 'gegund') && !rij.ontvangen_op) {
    velden.ontvangen_op = vandaagISO()
  }

  const { error } = await db.from('dossier_uitvragen').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }
  ververs(rij.dossier_id)
  return { ok: true }
}

/**
 * Verwijderen. Een regel waarover al gemaild is, verdwijnt niet zomaar: dat wist het spoor van wat er
 * naar buiten is gegaan. De UI biedt in dat geval "intrekken" aan, wat de historie bewaart.
 */
export async function verwijderUitvraag(id: string): Promise<ActieResultaat> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: rij } = await db
    .from('dossier_uitvragen')
    .select('dossier_id, aangevraagd_op, rappels')
    .eq('id', id)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Uitvraag niet gevonden.' }
  await assertDossierBewerkbaar(rij.dossier_id)

  if (rij.aangevraagd_op || (rij.rappels ?? 0) > 0) {
    return {
      ok: false,
      error: 'Deze uitvraag is al verstuurd. Zet hem op "Ingetrokken" — dan blijft zichtbaar wat er is gemaild.',
    }
  }

  const { error } = await db.from('dossier_uitvragen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  ververs(rij.dossier_id)
  return { ok: true }
}
