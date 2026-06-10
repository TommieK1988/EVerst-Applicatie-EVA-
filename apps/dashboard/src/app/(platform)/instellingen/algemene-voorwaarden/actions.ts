'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const PAD = '/instellingen/algemene-voorwaarden'

export interface AlgemeneVoorwaarden {
  id: string
  naam: string
  bestand_url: string
  versie: string | null
  is_standaard: boolean
  created_at: string
}

export async function getAlgemeneVoorwaarden(): Promise<AlgemeneVoorwaarden[]> {
  const { data, error } = await db()
    .from('algemene_voorwaarden')
    .select('*')
    .order('naam')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function maakAlgemeneVoorwaarden(data: {
  naam: string
  bestand_url: string
  versie?: string
}): Promise<string> {
  const { data: row, error } = await db()
    .from('algemene_voorwaarden')
    .insert({ is_standaard: false, ...data })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
  return row.id as string
}

export async function verwijderAlgemeneVoorwaarden(id: string): Promise<void> {
  const { error } = await db().from('algemene_voorwaarden').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}

export async function setStandaardAlgemeneVoorwaarden(id: string): Promise<void> {
  await db().from('algemene_voorwaarden').update({ is_standaard: false }).neq('id', 'none')
  const { error } = await db().from('algemene_voorwaarden').update({ is_standaard: true }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}
