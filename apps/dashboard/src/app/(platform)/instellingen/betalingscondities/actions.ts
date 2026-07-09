'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const PAD = '/instellingen/betalingscondities'

export interface Termijn {
  omschrijving: string
  percentage: number
}

export interface Betalingsconditie {
  id: string
  naam: string
  termijnen: Termijn[]
  volgorde: number
  created_at: string
}

export async function getBetalingscondities(): Promise<Betalingsconditie[]> {
  const { data, error } = await db()
    .from('betalingscondities')
    .select('id, naam, termijnen, volgorde, created_at')
    .order('volgorde')
    .order('naam')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function maakBetalingsconditie(data: {
  naam: string
  termijnen: Termijn[]
  volgorde?: number
}): Promise<string> {
  const { data: row, error } = await db()
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
  termijnen?: Termijn[]
  volgorde?: number
}): Promise<void> {
  const { error } = await db()
    .from('betalingscondities')
    .update(data)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}

export async function verwijderBetalingsconditie(id: string): Promise<void> {
  const { error } = await db().from('betalingscondities').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}
