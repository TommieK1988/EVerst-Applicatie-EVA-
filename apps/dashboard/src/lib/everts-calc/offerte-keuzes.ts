import { getBetalingscondities } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import { getAlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'

/**
 * Zijn de betalingsconditie en algemene voorwaarden die op een calculatie staan
 * nog te kiezen? Een calculatie bewaart alleen het id (JSON-blob, geen FK); is de
 * set daarna gearchiveerd of verwijderd, dan moet er opnieuw gekozen worden. De
 * get-acties geven alleen niet-gearchiveerde rijen. Leeg telt ook als ongeldig.
 */
export async function offerteKeuzesBestaan(
  betalingsconditieId: string | null | undefined,
  voorwaardenId: string | null | undefined,
): Promise<boolean> {
  if (!betalingsconditieId || !voorwaardenId) return false
  let condities, voorwaarden
  try {
    ;[condities, voorwaarden] = await Promise.all([getBetalingscondities(), getAlgemeneVoorwaarden()])
  } catch {
    // Controle zelf mislukt: niet blokkeren. Klopt een keuze echt niet, dan meldt
    // het offerte-dialoog de fout bij het aanmaken.
    return true
  }
  return condities.some(c => c.id === betalingsconditieId) && voorwaarden.some(v => v.id === voorwaardenId)
}
