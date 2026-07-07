'use server'

import { createClient } from '@/lib/everts-calc/supabase/server'

/** Huidige ingelogde Supabase auth-gebruiker (voor gebruiker_layouts.user_id). */
export async function haalHuidigeGebruikerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
