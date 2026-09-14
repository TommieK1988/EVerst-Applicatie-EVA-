import { redirect } from 'next/navigation'

/**
 * De offerte-opmaak is sinds september 2026 een tabblad van het Offertes-scherm. Let op: de editor onder /offerte-layout/[id] bestaat nog wel, LayoutsBeheer linkt daarheen.
 * Deze route blijft bestaan omdat hij in bladwijzers en oudere links staat.
 * LayoutsBeheer, actions en de editor onder [id] blijven hier staan; /instellingen/offertes importeert ze.
 */
export default function OfferteLayoutPagina() {
  redirect('/instellingen/offertes?deel=opmaak')
}
