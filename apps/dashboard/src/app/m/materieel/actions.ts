'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError } from '@/lib/auth/rechten'
import { vereisMaterieelMutatie } from '@/lib/materieel/auth'
import type { ScanBestemming } from '@/lib/materieel/qr'
import { zoekOpCode } from '@/lib/materieel/zoeken'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Server-acties voor de mobiele materieel-flow.
 *
 * LET OP: in een `'use server'`-module mag ELKE export een async functie zijn.
 * Een constante of type erbij zetten geeft een groene `tsc` en een rode
 * Vercel-build. Gedeelde types staan daarom in `lib/materieel/*`.
 */

type Uitkomst<T> = { ok: true; data: T } | { ok: false; error: string }

async function gate(min: 'lezen' | 'schrijven' | 'beheren' = 'schrijven') {
  try {
    return { ok: true as const, medewerker: await vereisMaterieelMutatie(min) }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false as const, error: e.message }
    throw e
  }
}

/**
 * Een gescande of ingetypte code opzoeken.
 *
 * Alleen lezen — dus ook bruikbaar voor iemand die wél mag kijken maar niets
 * mag toevoegen. Of de gebruiker met een onbekende code verder mág, bepaalt het
 * scherm erna (dat vraagt 'schrijven').
 */
export async function zoekScan(payload: string): Promise<Uitkomst<ScanBestemming>> {
  const g = await gate('lezen'); if (!g.ok) return g

  const code = payload.trim()
  if (!code) return { ok: false, error: 'Lege code' }

  const object = await zoekOpCode(code)
  if (object) {
    return { ok: true, data: { soort: 'bekend', id: object.id, omschrijving: object.omschrijving } }
  }
  return { ok: true, data: { soort: 'onbekend', code } }
}

/**
 * Een sticker aan bestaand materieel hangen — voor het geval het object al in
 * EVA staat (bijv. door kantoor ingevoerd) en er nu pas een sticker op gaat.
 *
 * De code wordt ruw bewaard: precies wat de scanner las. Zit hij al op een ander
 * object, dan geeft de unieke sleutel in de database een leesbare fout terug —
 * dat is de bedoeling, want twee objecten met dezelfde sticker maakt scannen
 * onbetrouwbaar.
 */
export async function koppelSticker(objectId: string, payload: string): Promise<Uitkomst<null>> {
  const g = await gate(); if (!g.ok) return g

  const code = payload.trim()
  if (!code) return { ok: false, error: 'Lege code' }

  const bestaand = await zoekOpCode(code)
  if (bestaand && bestaand.id !== objectId) {
    return { ok: false, error: `Deze sticker hangt al op "${bestaand.omschrijving}"` }
  }

  const { error } = await db().from('materieel_objecten').update({ qr_code: code }).eq('id', objectId)
  if (error) {
    return { ok: false, error: error.code === '23505' ? 'Deze sticker is al in gebruik' : error.message }
  }

  revalidatePath(`/m/materieel/${objectId}`)
  revalidatePath(`/materieelbeheer/${objectId}`)
  return { ok: true, data: null }
}

/**
 * Scan vastleggen: wie zag dit object wanneer. Dat is de goedkoopste manier om
 * later een vermist stuk gereedschap terug te vinden — iemand heeft het immers
 * nog gescand.
 */
export async function legScanVast(objectId: string): Promise<Uitkomst<null>> {
  const g = await gate(); if (!g.ok) return g
  const client = db()

  await client.from('materieel_scans').insert({
    object_id: objectId, gescand_door: g.medewerker.id, context: 'mobiel',
  })
  await client.from('materieel_objecten').update({
    laatst_gescand_at: new Date().toISOString(), laatst_gescand_door: g.medewerker.id,
  }).eq('id', objectId)

  revalidatePath(`/m/materieel/${objectId}`)
  return { ok: true, data: null }
}

/** Materieel op eigen naam zetten, of juist weer inleveren. */
export async function zetOpMijnNaam(objectId: string): Promise<Uitkomst<null>> {
  const g = await gate(); if (!g.ok) return g
  const client = db()

  await client.from('materieel_toewijzingen').update({ tot: new Date().toISOString() })
    .eq('object_id', objectId).is('tot', null)

  const { error } = await client.from('materieel_toewijzingen').insert({
    object_id: objectId, niveau: 'persoonlijk', medewerker_id: g.medewerker.id,
    door: g.medewerker.id, opmerking: 'Zelf gescand op de telefoon',
  })
  if (error) return { ok: false, error: error.message }

  const { error: updErr } = await client.from('materieel_objecten').update({
    toewijzing_niveau: 'persoonlijk',
    toegewezen_medewerker_id: g.medewerker.id,
    toegewezen_team_id: null,
    status: 'in_gebruik',
  }).eq('id', objectId)
  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath(`/m/materieel/${objectId}`)
  revalidatePath(`/materieelbeheer/${objectId}`)
  return { ok: true, data: null }
}
