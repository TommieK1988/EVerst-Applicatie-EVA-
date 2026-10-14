'use server'

import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { haalAgendaVenster } from '@/lib/agenda/mijn-agenda'
import { haalCollega, magCollegaAgenda } from '@/lib/agenda/collega-agenda'
import { maandUitSleutel, maandVenster, type AgendaItem } from '@/lib/agenda/agenda-model'

/**
 * Items voor het rooster van één maand ('yyyy-MM'), zodat de agenda maanden kan
 * bijladen zonder de pagina opnieuw te renderen.
 *
 * Zonder `wie` is het de eigen agenda, en dan wordt de medewerker hier zélf
 * bepaald en nooit uit de client overgenomen: een server action is een publiek
 * POST-endpoint, en onder `/m` draait alles op de admin-client zonder RLS eronder.
 * Mét `wie` (de agenda van een collega) eerst de rechtencontrole, net als de pagina.
 */
export async function haalAgendaMaand(maandISO: string, wie?: string | null): Promise<AgendaItem[]> {
  if (!/^\d{4}-\d{2}$/.test(maandISO)) return []

  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return []

  // Het rooster, niet de kalendermaand: december loopt door tot in januari.
  const { van, tot } = maandVenster(maandUitSleutel(maandISO))

  if (wie && wie !== medewerker.id) {
    if (!(await magCollegaAgenda(medewerker))) return []
    const collega = await haalCollega(wie)
    if (!collega) return []
    return haalAgendaVenster(collega, van, tot, { alsCollega: true })
  }
  return haalAgendaVenster(medewerker, van, tot)
}
