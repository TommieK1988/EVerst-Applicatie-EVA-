'use client'

import { useLocale } from 'next-intl'
import type { Locale as DateFnsLocale } from 'date-fns'
import { nl as dfNl, pl as dfPl, ta as dfTa } from 'date-fns/locale'
import { LOCALE, naarTaal, type Taal } from './talen'

/** Taal van de app zoals de provider in `/m` die zet. Buiten `/m` altijd `nl`. */
export function useTaal(): Taal {
  return naarTaal(useLocale())
}

/**
 * Locale voor `toLocaleDateString` / `Intl.NumberFormat` in client-componenten.
 * Vervangt een vaste `'nl-NL'`:
 *
 *   const locale = useDatumLocale()
 *   datum.toLocaleDateString(locale, { weekday: 'long' })
 */
export function useDatumLocale(): string {
  return LOCALE[useTaal()]
}

/**
 * date-fns-locale bij de taal van de app, voor `format(datum, 'EEEE d MMMM', { locale })`.
 * Vervangt een vaste `import { nl } from 'date-fns/locale'` in de app.
 */
export function useDateFnsLocale(): DateFnsLocale {
  return DATE_FNS_LOCALE[useTaal()]
}

const DATE_FNS_LOCALE: Record<Taal, DateFnsLocale> = { nl: dfNl, pl: dfPl, ta: dfTa }
