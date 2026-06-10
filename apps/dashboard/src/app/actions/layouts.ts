'use server'

import { createAdminClient } from '@everts/database/server'
import type { KolomConfig, GebruikerLayout } from '@everts/database/platform-types'

type ActionResult = { ok: true } | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export async function laadLayouts(user_id: string, scherm: string): Promise<GebruikerLayout[]> {
  const supabase = db()
  const { data } = await supabase
    .from('gebruiker_layouts')
    .select('*')
    .eq('user_id', user_id)
    .eq('scherm', scherm)
    .order('created_at', { ascending: true })
  return (data ?? []) as GebruikerLayout[]
}

export async function slaLayoutOp(
  user_id: string,
  scherm: string,
  naam: string,
  kolommen: KolomConfig[],
  id?: string,
): Promise<ActionResult & { id?: string }> {
  const supabase = db()
  if (id) {
    const { error } = await supabase
      .from('gebruiker_layouts')
      .update({ naam, kolommen, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user_id)
    if (error) return { ok: false, error: error.message }
    return { ok: true, id }
  } else {
    const { data, error } = await supabase
      .from('gebruiker_layouts')
      .insert({ user_id, scherm, naam, kolommen })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data.id }
  }
}

export async function verwijderLayout(id: string, user_id: string): Promise<ActionResult> {
  const supabase = db()
  const { error } = await supabase
    .from('gebruiker_layouts')
    .delete()
    .eq('id', id)
    .eq('user_id', user_id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function stelStandaardIn(id: string, user_id: string, scherm: string): Promise<ActionResult> {
  const supabase = db()
  // reset all for this user+scherm
  const { error: e1 } = await supabase
    .from('gebruiker_layouts')
    .update({ is_standaard: false })
    .eq('user_id', user_id)
    .eq('scherm', scherm)
  if (e1) return { ok: false, error: e1.message }

  const { error: e2 } = await supabase
    .from('gebruiker_layouts')
    .update({ is_standaard: true })
    .eq('id', id)
    .eq('user_id', user_id)
  if (e2) return { ok: false, error: e2.message }
  return { ok: true }
}
