'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> { return createClient() }

const PAD = '/instellingen/offertes'

export interface Sjabloontekst {
  id: string
  naam: string
  inhoud_html: string
  categorie: string
  volgorde: number
  created_at: string
  updated_at: string
}

export async function getSjabloonteksten(): Promise<Sjabloontekst[]> {
  const db = await getDb()
  const { data, error } = await db
    .from('sjabloonteksten')
    .select('*')
    .order('volgorde')
    .order('naam')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function maakSjabloontekst(data: {
  naam: string
  inhoud_html: string
  categorie?: string
  volgorde?: number
}): Promise<string> {
  const db = await getDb()
  const { data: row, error } = await db
    .from('sjabloonteksten')
    .insert({ categorie: 'algemeen', volgorde: 0, ...data })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
  return row.id as string
}

export async function updateSjabloontekst(id: string, data: {
  naam?: string
  inhoud_html?: string
  categorie?: string
  volgorde?: number
}): Promise<void> {
  const db = await getDb()
  const { error } = await db
    .from('sjabloonteksten')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}

export async function verwijderSjabloontekst(id: string): Promise<void> {
  const db = await getDb()
  const { error } = await db.from('sjabloonteksten').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(PAD)
}
