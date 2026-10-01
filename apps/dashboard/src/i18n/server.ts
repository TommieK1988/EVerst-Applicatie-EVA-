import 'server-only'
import { cache } from 'react'
import { getTranslations } from 'next-intl/server'
import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import type { Naamruimte } from './berichten'
import { LOCALE, naarTaal, STANDAARD_TAAL, type Taal } from './talen'

/**
 * Taal van een medewerker. Fail-soft: lukt het lezen niet (of bestaat de kolom op deze
 * omgeving nog niet), dan is het Nederlands — de app mag nooit stuklopen op vertalen.
 *
 * Bewust een losse query en niet in `getCurrentMedewerker()`: dat select staat op een
 * vaste kolomlijst, en een kolom die (nog) niet bestaat zou daar álles laten falen.
 */
export async function taalVanMedewerker(medewerkerId: string): Promise<Taal> {
  try {
    const { data, error } = await createAdminClient()
      .from('medewerkers')
      .select('taal')
      .eq('id', medewerkerId)
      .maybeSingle()
    if (error) return STANDAARD_TAAL
    return naarTaal((data as { taal?: unknown } | null)?.taal)
  } catch {
    return STANDAARD_TAAL
  }
}

/** Taal van de medewerker achter een auth-gebruiker (voor pushmeldingen aan iemand anders). */
export async function taalVanGebruiker(authUserId: string): Promise<Taal> {
  try {
    const { data, error } = await createAdminClient()
      .from('medewerkers')
      .select('taal')
      .eq('auth_user_id', authUserId)
      .eq('actief', true)
      .limit(1)
      .maybeSingle()
    if (error) return STANDAARD_TAAL
    return naarTaal((data as { taal?: unknown } | null)?.taal)
  } catch {
    return STANDAARD_TAAL
  }
}

/** Taal van de ingelogde medewerker, één keer per request. */
export const getAppTaal = cache(async (): Promise<Taal> => {
  const medewerker = await getCurrentMedewerker().catch(() => null)
  if (!medewerker) return STANDAARD_TAAL
  return taalVanMedewerker(medewerker.id)
})

/** Locale voor datums/getallen van de ingelogde medewerker (`nl-NL`, `pl-PL`, `ta-LK`). */
export async function getAppLocale(): Promise<string> {
  return LOCALE[await getAppTaal()]
}

/**
 * Vertaler voor servercode in `/m` (pagina's, metadata, server actions).
 *
 *   const t = await getAppVertaler('planning')
 *   t('titel')
 */
export async function getAppVertaler<N extends Naamruimte>(namespace: N) {
  const taal = await getAppTaal()
  return getTranslations({ locale: taal, namespace })
}

/** Vertaler in een expliciete taal — voor pushmeldingen naar iemand anders dan de ingelogde gebruiker. */
export async function getVertalerVoor<N extends Naamruimte>(taal: Taal, namespace: N) {
  return getTranslations({ locale: taal, namespace })
}
