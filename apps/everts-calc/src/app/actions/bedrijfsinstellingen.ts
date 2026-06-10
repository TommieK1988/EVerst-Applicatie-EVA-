'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Uurtarief = { label: string; tarief: number; is_favoriet?: boolean }
export type Bedrijfsinstellingen = {
  id:           number
  uurtarieven:  Uurtarief[]
  btw_tarieven: number[]
  overige:      Record<string, unknown>
  updated_at:   string
}

export async function getBedrijfsinstellingen(): Promise<Bedrijfsinstellingen> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('bedrijfsinstellingen')
    .select('*')
    .eq('id', 1)
    .single()
  if (!data) {
    return { id: 1, uurtarieven: [], btw_tarieven: [0, 9, 21], overige: {}, updated_at: new Date().toISOString() }
  }
  return data as Bedrijfsinstellingen
}

export async function setUurtarieven(uurtarieven: Uurtarief[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('bedrijfsinstellingen')
    .update({ uurtarieven })
    .eq('id', 1)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen')
  return { ok: true }
}
