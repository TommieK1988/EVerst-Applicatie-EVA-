'use server'

import { createAdminClient } from '@everts/database/server'

export type MedewerkerRef = { id: string; naam: string; afdeling: string | null }

/** Zoek actieve medewerkers voor de delegatie-picker (overdragen / meekijken). */
export async function zoekMedewerkers(zoekterm: string): Promise<MedewerkerRef[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  let query = db
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, afdeling')
    .eq('actief', true)
    .order('achternaam', { ascending: true })
    .limit(25)

  const term = zoekterm?.trim()
  if (term && term.length >= 2) {
    query = query.or(`voornaam.ilike.%${term}%,achternaam.ilike.%${term}%`)
  }

  const { data } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(m => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    afdeling: m.afdeling ?? null,
  }))
}
