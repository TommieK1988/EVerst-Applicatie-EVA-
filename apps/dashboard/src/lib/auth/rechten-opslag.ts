import 'server-only'
import type { RechtenSet, RechtenDocument, KanaalRechten } from '@everts/database/platform-types'
import { leesRechtenDocument, alsPlatteSet } from '@everts/database/rechten'

/**
 * Wat er weggeschreven moet worden als iemand rechten opslaat: de v2-kolom
 * `rechten` én de platte spiegel (`standaard_rechten` / `rechten_override`).
 *
 * De spiegel blijft nodig zolang er SQL-lezers zijn die hem rechtstreeks
 * bevragen: lib/bouw7/sync.ts, lib/wagenpark/notificaties.ts en
 * lib/wagenpark/compliance-kern.ts. Schrijf je alleen v2, dan lopen die stil
 * achter; schrijf je alleen de spiegel, dan doet opslaan niets omdat de lezer
 * v2 voorrang geeft.
 */
export type RechtenOpslag = { rechten: RechtenDocument; plat: RechtenSet }

/** Zet één kanaal om en laat het andere kanaal ongemoeid. */
export function schrijfKanaal(
  huidig: unknown,
  huidigePlatteSpiegel: unknown,
  kanaal: 'desktop' | 'mobiel',
  nieuw: KanaalRechten,
): RechtenOpslag {
  const doc = leesRechtenDocument(huidig, huidigePlatteSpiegel)
  const uit: RechtenDocument = { ...doc, [kanaal]: nieuw }
  // De spiegel is altijd de DESKTOP-set: de SQL-lezers die hem gebruiken draaien
  // in cronjobs en notificaties, waar geen kanaal bij hoort.
  return { rechten: uit, plat: alsPlatteSet(uit.desktop) }
}

/**
 * Overgangsvorm voor de oude beheerschermen, die alleen een platte set kennen.
 * Die set is per definitie het desktopkanaal; het mobiele kanaal blijft staan
 * zoals het stond. Verdwijnt zodra het nieuwe rechtenscherm beide kanalen zet.
 */
export function schrijfPlatteDesktopSet(
  huidig: unknown,
  huidigePlatteSpiegel: unknown,
  platteSet: RechtenSet,
): RechtenOpslag {
  const alsKanaal = leesRechtenDocument(null, platteSet).desktop
  return schrijfKanaal(huidig, huidigePlatteSpiegel, 'desktop', alsKanaal)
}
