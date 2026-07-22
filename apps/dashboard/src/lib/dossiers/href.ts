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
