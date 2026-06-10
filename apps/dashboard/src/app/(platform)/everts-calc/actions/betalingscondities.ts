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
  is_standaard: boolean
  volgorde: number
  created_at: string
}

export async function getBetalingscondities(): Promise<Betalingsconditie[]> {
  const db = await getDb()
  const { data, error } = await db
    .from('betalingscondities')
    .select('*')
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
    .insert({ is_standaard: false, volgorde: 0, ...data })
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

export async function verwijderBetalingsconditie(id: string): Promise<void> {
  const db = await getDb()
  const { error } = await db.from('betalingscondities').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}

export async function setStandaardBetalingsconditie(id: string): Promise<void> {
  const db = await getDb()
  await db.from('betalingscondities').update({ is_standaard: false }).neq('id', 'none')
  const { error } = await db.from('betalingscondities').update({ is_standaard: true }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}
