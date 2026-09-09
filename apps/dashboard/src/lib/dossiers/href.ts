/**
 * Detail-URL van een dossier. Er is géén losse `/dossiers/[id]`-route: de detailpagina
 * loopt per hoofdstatus (aanvraag → /aanvragen, offerte → /offertes, opdracht → /opdrachten).
 * Onbekende of lege hoofdstatus valt terug op /opdrachten — dat is de route die het
 * dossier-detailscherm hoe dan ook rendert.
 *
 * Pure helper (geen 'server-only'): wordt zowel server- als client-side gebruikt.
 */
const HOOFDSTATUS_SEGMENT: Record<string, string> = {
  aanvraag: 'aanvragen',
  offerte: 'offertes',
  opdracht: 'opdrachten',
}

export function dossierHref(id: string, hoofdstatus: string | null): string {
  const seg = HOOFDSTATUS_SEGMENT[hoofdstatus ?? ''] ?? 'opdrachten'
  return `/${seg}/${id}`
}

/**
 * Het routesegment van een dossier, servicedesk meegerekend. `null` betekent: dit dossier heeft
 * geen detailroute waar je zeker van bent -- val dan terug op een ander scherm in plaats van een
 * gok, want een verkeerd segment geeft een 404.
 */
export function dossierSegment(
  hoofdstatus: string | null,
  servicedeskSubstatus: string | null,
): string | null {
  if (servicedeskSubstatus) return 'servicedesk'
  return HOOFDSTATUS_SEGMENT[hoofdstatus ?? ''] ?? null
}

/**
 * Waar je een offerte opent.
 *
 * In het dossier, op de Calculatie-tab: die opent de offerte inline via `?offerte=`, met de
 * goedkeur- en verzendknop erbij. Dat is sinds de offerte-module in het dossier landde de enige
 * plek waar je hem hoort te openen -- `OfferteDetail` zegt het zelf ook: "geen route-sprong naar
 * /everts-calc". De losse preview daar is de terugval voor een offerte zonder dossier.
 *
 * De widget Goedkeuren en de goedkeur-notificatie stuurden je nog wél naar die losse preview, en
 * dat liep vast: staat de offerte niet meer in de database (concept verwijderd, opnieuw
 * gegenereerd), dan doet die pagina `notFound()` en krijg je een 404 in plaats van je dossier.
 */
export function offerteHref(
  quoteId: string,
  dossier: { id: string | null; hoofdstatus: string | null; servicedeskSubstatus: string | null } | null,
): string {
  const seg = dossier?.id ? dossierSegment(dossier.hoofdstatus, dossier.servicedeskSubstatus) : null
  if (!dossier?.id || !seg) return `/everts-calc/quotes/${quoteId}/preview`
  return `/${seg}/${dossier.id}/calculatie?offerte=${quoteId}`
}
