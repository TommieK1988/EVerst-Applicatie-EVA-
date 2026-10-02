'use server'

import { vereisSessie, GeenToegangError } from '@/lib/auth/rechten'
import { taalVanMedewerker } from '@/i18n/server'
import { MAX_TEKSTEN, vertaal } from './kern'

/**
 * Vertaal teksten van kantoor naar de app-taal van de ingelogde medewerker.
 * Staat die op Nederlands, dan komt er alleen `null` terug (niets te doen).
 * Gebruikt door `useVertaling` / `<VertaalbareTekst>` in EVA Mobiel.
 */
export async function vertaalVoorMij(teksten: string[]): Promise<(string | null)[]> {
  let medewerkerId: string
  try {
    medewerkerId = (await vereisSessie()).id
  } catch (e) {
    if (e instanceof GeenToegangError) return teksten.map(() => null)
    throw e
  }
  if (!Array.isArray(teksten)) return []
  const invoer = teksten.slice(0, MAX_TEKSTEN).map((t) => (typeof t === 'string' ? t : ''))
  const taal = await taalVanMedewerker(medewerkerId)
  const uit = await vertaal(invoer, taal)
  // Boven de grens: niet vertaald, origineel tonen.
  return [...uit, ...teksten.slice(MAX_TEKSTEN).map(() => null)]
}
