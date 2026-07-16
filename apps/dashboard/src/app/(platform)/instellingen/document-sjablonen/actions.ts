'use server'

/**
 * Server-actions voor het beheer van documentsjablonen.
 *
 * Elke muterende action begint met `vereisBeheerder()`. Dat is bewust strenger dan
 * de offerte-layout-tegenhanger (`everts-calc/actions/quote-instellingen.ts`), die
 * géén rechtencheck heeft — daar kan op dit moment elke platform-gebruiker de
 * layouts wijzigen. Dat gat kopiëren we hier niet.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisBeheerder } from '@/lib/auth/rechten'
import type { DocumentSjabloon, DocumentVeld } from '@/lib/documenten/types'

const PAD = '/instellingen/document-sjablonen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  // `document_sjablonen` staat niet in de gegenereerde database.types.ts (stale) —
  // vandaar de any-cast, conform het patroon elders in deze codebase.
  return createAdminClient() as any
}

/** Normaliseert een rij uit de DB: `velden` is jsonb en kan alles zijn. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function naarSjabloon(row: any): DocumentSjabloon {
  return { ...row, velden: Array.isArray(row?.velden) ? row.velden : [] } as DocumentSjabloon
}

export async function getSjablonen(): Promise<DocumentSjabloon[]> {
  const { data } = await db()
    .from('document_sjablonen')
    .select('*')
    .order('volgorde', { ascending: true })
    .order('naam', { ascending: true })
  return (data ?? []).map(naarSjabloon)
}

export async function getSjabloon(id: string): Promise<DocumentSjabloon | null> {
  const { data } = await db().from('document_sjablonen').select('*').eq('id', id).maybeSingle()
  return data ? naarSjabloon(data) : null
}

export async function maakSjabloon(naam: string, documentsoort: string): Promise<string> {
  await vereisBeheerder()
  const { data, error } = await db()
    .from('document_sjablonen')
    .insert({ naam: naam.trim() || 'Nieuw sjabloon', documentsoort })
    .select('id')
    .single()
  if (error) throw new Error('Sjabloon aanmaken mislukt')
  revalidatePath(PAD)
  return data.id as string
}

export async function updateSjabloon(id: string, data: Record<string, unknown>): Promise<void> {
  await vereisBeheerder()
  const { error } = await db()
    .from('document_sjablonen')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error('Opslaan mislukt')
  revalidatePath(PAD)
  revalidatePath(`${PAD}/${id}`)
}

export async function kopieerSjabloon(id: string): Promise<string> {
  await vereisBeheerder()
  const bron = await getSjabloon(id)
  if (!bron) throw new Error('Sjabloon niet gevonden')
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = bron
  const { data, error } = await db()
    .from('document_sjablonen')
    .insert({ ...rest, naam: `Kopie van ${bron.naam}`.slice(0, 120) })
    .select('id')
    .single()
  if (error) throw new Error('Kopiëren mislukt')
  revalidatePath(PAD)
  return data.id as string
}

export async function verwijderSjabloon(id: string): Promise<void> {
  await vereisBeheerder()
  const { error } = await db().from('document_sjablonen').delete().eq('id', id)
  if (error) throw new Error('Verwijderen mislukt')
  revalidatePath(PAD)
}

/** Slaat de invoervelden-definitie op. Apart van updateSjabloon i.v.m. validatie. */
export async function updateVelden(id: string, velden: DocumentVeld[]): Promise<void> {
  await vereisBeheerder()
  // Sleutels moeten uniek en tag-veilig zijn: ze worden {invoer.<sleutel>}.
  const schoon: DocumentVeld[] = []
  const gezien = new Set<string>()
  for (const v of velden) {
    const sleutel = (v.sleutel ?? '').trim()
    if (!sleutel || gezien.has(sleutel) || !/^[a-z0-9_]+$/.test(sleutel)) continue
    gezien.add(sleutel)
    schoon.push({
      sleutel,
      label: (v.label ?? '').trim() || sleutel,
      type: v.type ?? 'tekst',
      verplicht: !!v.verplicht,
      standaard: v.standaard ?? '',
      opties: v.type === 'keuze' ? (v.opties ?? []).filter(Boolean) : undefined,
      hint: v.hint ?? '',
    })
  }
  await updateSjabloon(id, { velden: schoon })
}
