'use client'

import { useLocale } from 'next-intl'
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
