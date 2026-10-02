import { getBetalingscondities } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import { getAlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'

/**
 * Bestaan de betalingsconditie en algemene voorwaarden die op een calculatie
 * staan nog? Een calculatie bewaart alleen het id; wordt de set daarna onder
 * Instellingen verwijderd, dan wijst de calculatie nergens meer naar en weigert
 * de database de offerte (foreign key). Leeg telt ook als ongeldig.
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
