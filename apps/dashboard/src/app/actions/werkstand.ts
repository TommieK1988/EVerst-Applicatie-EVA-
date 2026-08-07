'use server'

import { createAdminClient } from '@everts/database/server'
import type { TabelWerkstand } from '@everts/database/platform-types'

type ActionResult = { ok: true } | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * De werkstand van één overzichtscherm. Geeft `null` terug als de gebruiker het
 * scherm nog nooit heeft aangepast — de aanroeper valt dan terug op de standaard
 * layout of op de kolomdefinities.
 */
export async function laadWerkstand(user_id: string, scherm: string): Promise<TabelWerkstand | null> {
  const supabase = db()
  const { data, error } = await supabase
    .from('gebruiker_werkstand')
    .select('staat')
    .eq('user_id', user_id)
    .eq('scherm', scherm)
    .maybeSingle()
  if (error || !data?.staat) return null
  return data.staat as TabelWerkstand
}

/**
 * Schrijft de werkstand weg. Eén rij per gebruiker per scherm, dus een upsert op de
 * primaire sleutel — geen historie, alleen de laatste stand.
 */
export async function bewaarWerkstand(
  user_id: string,
  scherm: string,
  staat: TabelWerkstand,
): Promise<ActionResult> {
  const supabase = db()
  const { error } = await supabase
    .from('gebruiker_werkstand')
    .upsert(
      { user_id, scherm, staat, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,scherm' },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Geen wis-actie: "Weergave herstellen" zet de tabel terug op de standaardstand en laat
// die langs de gewone weg wegschrijven. Verwijderen zou racen met diezelfde schrijfactie.
