'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, vereisSessie, GeenToegangError } from '@/lib/auth/rechten'
import { isTaal } from '@/i18n/talen'

type Resultaat = { ok: true } | { ok: false; error: string }

async function schrijfTaal(medewerkerId: string, taal: string): Promise<Resultaat> {
  if (!isTaal(taal)) return { ok: false, error: 'Onbekende taal' }
  const { error } = await createAdminClient()
    .from('medewerkers')
    .update({ taal })
    .eq('id', medewerkerId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * De ingelogde medewerker kiest zelf de taal van de app (Profiel → Instellingen).
 * Schrijft uitsluitend de eigen rij: het id komt uit de sessie, niet van de aanroeper.
 */
export async function zetMijnAppTaal(taal: string): Promise<Resultaat> {
  let medewerkerId: string
  try {
    medewerkerId = (await vereisSessie()).id
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
  const res = await schrijfTaal(medewerkerId, taal)
  // De hele app hangt aan de taal: layout opnieuw renderen.
  if (res.ok) revalidatePath('/m', 'layout')
  return res
}

/** Kantoor zet de app-taal van een medewerker (medewerkerkaart). */
export async function zetAppTaalVanMedewerker(medewerkerId: string, taal: string): Promise<Resultaat> {
  try {
    await vereisRecht('medewerkers', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
  const res = await schrijfTaal(medewerkerId, taal)
  if (res.ok) revalidatePath(`/medewerkers/${medewerkerId}`)
  return res
}
