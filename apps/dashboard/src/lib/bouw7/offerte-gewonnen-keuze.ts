/**
 * Welke Bouw7-offerte is "de" gewonnen offerte als een dossier opdracht wordt? Pure logica, los van
 * de API, zodat hij te testen is (zie offerte-gewonnen.ts voor de write).
 *
 * Regel: staat er al een offerte op Gewonnen, dan is er niets te kiezen. Anders de recentste offerte
 * (op offertedatum, bij gelijke datum het hoogste id) die niet Verloren of Vervallen is. Dat is
 * dezelfde offerte waar de sync het dossierbedrag uit haalt (`quotationMap` in sync.ts: recentste
 * per project), dus het bedrag dat de gebruiker als aanneemsom ziet, is het bedrag dat gewonnen wordt.
 */

export type OfferteKandidaat = {
  id: number
  quotationDate?: string | null
  subtotal?: string | number | null
  quotationStatus?: { id: number; name?: string } | null
}

const statusNaam = (q: OfferteKandidaat) => (q.quotationStatus?.name ?? '').toLowerCase()

export const isGewonnen = (q: OfferteKandidaat) => statusNaam(q).includes('gewonnen')
const isAfgevallen = (q: OfferteKandidaat) => /verloren|vervallen/.test(statusNaam(q))

export type OfferteKeuze =
  | { soort: 'al_gewonnen'; offerte: OfferteKandidaat }
  | { soort: 'zet_gewonnen'; offerte: OfferteKandidaat }
  | { soort: 'geen' }

export function kiesWinnendeOfferte(offertes: OfferteKandidaat[]): OfferteKeuze {
  const gewonnen = offertes.find(isGewonnen)
  if (gewonnen) return { soort: 'al_gewonnen', offerte: gewonnen }
  const open = offertes
    .filter(q => !isAfgevallen(q))
    .sort((a, b) => (b.quotationDate ?? '').localeCompare(a.quotationDate ?? '') || b.id - a.id)
  return open[0] ? { soort: 'zet_gewonnen', offerte: open[0] } : { soort: 'geen' }
}
