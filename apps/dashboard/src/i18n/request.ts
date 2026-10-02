import { getRequestConfig } from 'next-intl/server'
import { laadBerichten } from './berichten'
import { naarTaal, TIJDZONE } from './talen'

/**
 * next-intl-configuratie per request.
 *
 * Er is geen taal in de URL. Wie een vertaling op de server nodig heeft geeft de taal
 * expliciet mee — `getTranslations({ locale: taal, namespace })`, zie `i18n/server.ts`.
 * Zonder expliciete taal is het Nederlands: het kantoordeel van EVA vertaalt niet.
 */
export default getRequestConfig(async ({ locale }) => {
  const taal = naarTaal(locale)
  return {
    locale: taal,
    messages: await laadBerichten(taal),
    timeZone: TIJDZONE,
  }
})
