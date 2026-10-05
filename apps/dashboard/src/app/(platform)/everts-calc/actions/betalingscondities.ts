'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> { return createClient() }

const PAD = '/instellingen/offertes'

export interface Betalingsconditie {
  id: string
  naam: string
  tekst: string
  volgorde: number
  created_at: string
}

export async function getBetalingscondities(): Promise<Betalingsconditie[]> {
  const db = await getDb()
  const { data, error } = await db
    .from('betalingscondities')
    .select('*')
    .is('gearchiveerd_op', null)
    .order('volgorde')
    .order('naam')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function maakBetalingsconditie(data: {
  naam: string
  tekst: string
  volgorde?: number
}): Promise<string> {
  const db = await getDb()
  const { data: row, error } = await db
    .from('betalingscondities')
    .insert({ volgorde: 0, ...data })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
  return row.id as string
}

export async function updateBetalingsconditie(id: string, data: {
  naam?: string
  tekst?: string
  volgorde?: number
}): Promise<void> {
  const db = await getDb()
  const { error } = await db
    .from('betalingscondities')
    .update(data)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}

/** Archiveert in plaats van te verwijderen (DEVELOPMENT_STANDARDS §5.5): calculaties
 *  en verzonden offertes verwijzen naar deze rij. Hij verdwijnt uit de keuzelijsten,
 *  bestaande offertes houden hem. */
export async function verwijderBetalingsconditie(id: string): Promise<void> {
  const db = await getDb()
  const { error } = await db.from('betalingscondities')
    .update({ gearchiveerd_op: new Date().toISOString(), is_standaard: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}
