import 'server-only'
import { haalKostenTeKeuren, haalKostenVanMedewerkers, type KostenPost } from '@/lib/uren/onkosten-goedkeuring'

/**
 * De kosten op het mobiele fiatteerscherm (`/m/uren/keuren`).
 *
 * Twee soorten in één lijst, zoals bij de uren:
 *
 * - **Wat bij mij ligt** (`magKeuren`): kosten op een project waar ik projectleider ben, of
 *   zonder project van iemand die mij als goedkeurder heeft. Die keur ik hier goed of af.
 * - **Context**: de overige kosten van de mensen wier uren ik deze periode beoordeel. Alleen-
 *   lezen, met erbij bij wie ze liggen -- wie de week van Jan fiatteert, wil zien wat Jan die
 *   week verder declareerde, ook als een andere projectleider erover gaat.
 *
 * Wat bij mij ligt komt uit EVA en niet uit Bouw7. Het staat dus ook op het scherm als Bouw7 niet
 * bereikbaar is; daarom haalt de aanroeper dit los van de uren op.
 */

export type KeurOnkosten = KostenPost & {
  /** Ligt bij mij: goed- of afkeuren kan hier. */
  magKeuren: boolean
}

export async function haalKeurKosten(
  ikId: string,
  /** De medewerkers wier uren ik beoordeel; hun overige kosten komen als context mee. */
  contextVan: string[],
  van: string,
  tot: string,
): Promise<KeurOnkosten[]> {
  const [mijn, context] = await Promise.all([
    haalKostenTeKeuren(ikId),
    haalKostenVanMedewerkers(contextVan, van, tot),
  ])
  const mijnIds = new Set(mijn.map(k => k.id))
  return [
    ...mijn.map(k => ({ ...k, magKeuren: true })),
    // Een concept van de medewerker zelf hoort nog bij niemand; dat blijft weg.
    ...context
      .filter(k => !mijnIds.has(k.id) && (k.status !== 'open' || k.teBeoordelen))
      .map(k => ({ ...k, magKeuren: false })),
  ]
}
