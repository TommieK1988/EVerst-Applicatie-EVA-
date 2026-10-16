'use server'

import { createClient } from '@/lib/everts-calc/supabase/server'
import type { Instellingen } from '@/lib/everts-calc/types'

const ROW_ID = 'singleton'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> {
  return createClient()
}

/**
 * Globale calculatie-instellingen ophalen (of null als er niets is).
 *
 * De uurtarieven komen uit Stamgegevens → Uren → Uurtarieven (`bedrijfsinstellingen`),
 * niet uit deze rij: dat is de lijst die kantoor bijhoudt, en daar staat het ★-tarief
 * waarmee een calculatie begint. Eerder las de calculatie een eigen, lege lijst, waardoor
 * het uurtariefveld van een nieuwe calculatie altijd leeg bleef.
 */
export async function getCalcInstellingen(): Promise<Instellingen | null> {
  const supabase = await getDb()
  const [{ data, error }, { data: bedrijf }] = await Promise.all([
    supabase.from('everts_calc_instellingen').select('data').eq('id', ROW_ID).maybeSingle(),
    supabase.from('bedrijfsinstellingen').select('uurtarieven').eq('id', 1).maybeSingle(),
  ])
  if (error) throw new Error(error.message)
  const inhoud = (data?.data ?? {}) as Partial<Instellingen>
  const stamTarieven = (bedrijf?.uurtarieven ?? []) as NonNullable<Instellingen['uurtarieven']>
  const samen = stamTarieven.length > 0 ? { ...inhoud, uurtarieven: stamTarieven } : inhoud
  if (Object.keys(samen).length === 0) return null
  return samen as Instellingen
}

/** Globale calculatie-instellingen wegschrijven (upsert op de singleton-rij). */
export async function saveCalcInstellingen(inst: Instellingen): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase
    .from('everts_calc_instellingen')
    .upsert({ id: ROW_ID, data: inst, bijgewerkt_op: new Date().toISOString() })
  if (error) throw new Error(error.message)
}
