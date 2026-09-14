/**
 * Bijlagen van het handboek. Puur — de bucketnaam en de URL worden zowel
 * server- als clientzijde gebruikt.
 *
 * De bucket is privé en er is geen storage-policy voor `authenticated`: de
 * browser praat er nooit rechtstreeks mee. Uploaden doet het beheer met de
 * service-role, lezen gaat via {@link bijlageUrl}.
 */

export const HANDBOEK_BUCKET = 'handboek-bijlagen'

/** Link naar de proxy-route die per aanvraag opnieuw toetst of je erbij mag. */
export function bijlageUrl(bijlageId: string): string {
  return `/api/handboek/bijlage/${bijlageId}`
}

/** "1,4 MB" — voor onder de bijlagetitel. */
export function leesbareGrootte(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`
  return `${Math.round(bytes / 1024)} kB`
}
