'use server'

import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { haalAgendaVenster } from '@/lib/agenda/mijn-agenda'
import { maandUitSleutel, maandVenster, type AgendaItem } from '@/lib/agenda/agenda-model'

/**
 * Items voor het rooster van één maand ('yyyy-MM'), zodat de agenda maanden kan
 * bijladen zonder de pagina opnieuw te renderen.
 *
 * De medewerker wordt hier zélf bepaald en nooit uit de client overgenomen: een
 * server action is een publiek POST-endpoint, en onder `/m` draait alles op de
 * admin-client zonder RLS eronder.
 */
export async function haalAgendaMaand(maandISO: string): Promise<AgendaItem[]> {
  if (!/^\d{4}-\d{2}$/.test(maandISO)) return []

  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return []

  // Het rooster, niet de kalendermaand: december loopt door tot in januari.
  const { van, tot } = maandVenster(maandUitSleutel(maandISO))
  return haalAgendaVenster(medewerker, van, tot)
}
