'use server'

import { createClient } from '@/lib/everts-calc/supabase/server'
import type { Instellingen } from '@/lib/everts-calc/types'

const ROW_ID = 'singleton'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> {
  return createClient()
}

/** Globale calculatie-instellingen ophalen (of null als de rij nog leeg is). */
export async function getCalcInstellingen(): Promise<Instellingen | null> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('everts_calc_instellingen')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const inhoud = data?.data
  if (!inhoud || Object.keys(inhoud).length === 0) return null
  return inhoud as Instellingen
}

/** Globale calculatie-instellingen wegschrijven (upsert op de singleton-rij). */
export async function saveCalcInstellingen(inst: Instellingen): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase
    .from('everts_calc_instellingen')
    .upsert({ id: ROW_ID, data: inst, bijgewerkt_op: new Date().toISOString() })
  if (error) throw new Error(error.message)
}
