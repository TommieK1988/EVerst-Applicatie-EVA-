/**
 * Taakomschrijving (opgeslagen als `{ text: string }` of als losse string) naar
 * platte tekst. Gedeeld door het desktop-detailpaneel en de mobiele taak-popup.
 */
export function omschrijvingNaarTekst(omschrijving: unknown): string {
  if (!omschrijving) return ''
  if (typeof omschrijving === 'string') return omschrijving
  const obj = omschrijving as Record<string, unknown>
  if (typeof obj.text === 'string') return obj.text
  return ''
}
