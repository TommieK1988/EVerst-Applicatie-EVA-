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
 * Mag er voor deze medewerker een account worden aangemaakt? Geeft `null` als er niets aan de
 * hand is, en anders de melding voor de beheerder.
 *
 * Twee dingen kunnen misgaan, allebei achteraf niet door de medewerker zelf op te lossen:
 *
 *  1. De medewerker hangt al aan een account dat op een ánder adres staat. Opnieuw uitnodigen
 *     maakt op het nieuwe adres een tweede identiteit; `auth.users.email` van de eerste blijft
 *     staan zoals hij was, dus je houdt er twee en `auth_user_id` wijst er maar naar één.
 *  2. Het adres is al in gebruik door een andere medewerker. Dan zou deze uitnodiging het account
 *     van een collega oppakken.
 *
 * De meldingen zeggen erbij wat de beheerder moet doen; "niet toegestaan" alleen laat hem met
 * lege handen staan.
 */
export async function controleerEenAccount(
  medewerker_id: string,
  auth_user_id: string | null,
  email: string,
): Promise<{ ok: false; error: string } | null> {
  const adres = normaliseerEmail(email)
  if (!adres) return null

  const supabase = createAdminClient()

  if (auth_user_id) {
    const { data } = await supabase.auth.admin.getUserById(auth_user_id)
    const huidig = normaliseerEmail(data?.user?.email)
    if (huidig && huidig !== adres) {
      return {
        ok: false,
        error:
          `Deze medewerker heeft al een account op ${huidig}. Een tweede account op ${adres} zou `
          + 'twee losse inlogs voor één persoon opleveren, en daar komt hij zelf niet meer uit. '
          + 'Laat het bestaande account aanpassen in plaats van een nieuwe uitnodiging te sturen.',
      }
    }
  }

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
