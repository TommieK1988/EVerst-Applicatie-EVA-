import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { normaliseerEmail } from './account-regels'

/**
 * De databasekant van "één account per medewerker".
 *
 * Staat los van `account-regels.ts`: dat bestand bevat alleen de kale regel en is daarom zonder
 * server-omgeving te testen. Zodra er `server-only` en een Supabase-client bij komen kan dat niet
 * meer, dus die twee horen niet in hetzelfde bestand.
 */

/**
 * Het gekoppelde account, maar alleen als het nog bij het huidige adres van de medewerker hoort.
 *
 * Wordt het e-mailadres van een medewerker gewijzigd (privéadres → @everts.chat, of een ander
 * privéadres), dan blijft `auth_user_id` naar het account op het óúde adres wijzen. Wie daarna
 * met het nieuwe adres inlogt, kreeg "geen toegang" — zo ging het op 1 oktober 2026 bij twee
 * medewerkers. Geeft `null` als de koppeling niet meer klopt: die moet dan los, zodat de nieuwe
 * uitnodiging en de eerstvolgende login op het nieuwe adres landen.
 */
export async function koppelingVoorAdres(
  auth_user_id: string | null,
  email: string,
): Promise<string | null> {
  if (!auth_user_id) return null
  const { data } = await createAdminClient().auth.admin.getUserById(auth_user_id)
  const huidig = normaliseerEmail(data?.user?.email)
  return huidig && huidig === normaliseerEmail(email) ? auth_user_id : null
}

/**
 * Mag er voor deze medewerker een account worden aangemaakt? Geeft `null` als er niets aan de
 * hand is, en anders de melding voor de beheerder.
 *
 * Het adres mag niet al in gebruik zijn door een andere medewerker: dan zou deze uitnodiging
 * het account van een collega oppakken. (Een gewijzigd eigen adres is géén bezwaar meer — zie
 * `koppelingVoorAdres`.)
 */
export async function controleerEenAccount(
  medewerker_id: string,
  email: string,
): Promise<{ ok: false; error: string } | null> {
  const adres = normaliseerEmail(email)
  if (!adres) return null

  const supabase = createAdminClient()

  // `ilike` is een patroonvergelijking, geen gelijkheid: `_` en `%` zijn jokertekens en `_` is een
  // volkomen geldig teken in een e-mailadres. Zonder escapen matcht `jan_jansen@...` ook op
  // `janXjansen@...` en houdt deze controle een terechte uitnodiging tegen.
  const patroon = adres.replace(/([\\%_])/g, '\\$1')
  const { data: andere } = await supabase
    .from('medewerkers')
    .select('id, voornaam, achternaam')
    .ilike('email', patroon)
    .neq('id', medewerker_id)
    .limit(1)
    .maybeSingle()

  if (andere) {
    const naam = [andere.voornaam, andere.achternaam].filter(Boolean).join(' ')
      || 'een andere medewerker'
    return {
      ok: false,
      error:
        `${adres} staat ook op ${naam}. Eén e-mailadres hoort bij één medewerker; geef deze `
        + 'medewerker een eigen adres voordat je hem uitnodigt.',
    }
  }

  return null
}
