'use client'

import type { Locale } from 'date-fns'
import { nl, pl, ta } from 'date-fns/locale'
import { useTaal } from '@/i18n/client'
import type { Taal } from '@/i18n/talen'

/** De date-fns-locale bij de taal van de app, voor `format(..., { locale })`. */
const DATE_FNS_LOCALE: Record<Taal, Locale> = { nl, pl, ta }

export function useDateFnsLocale(): Locale {
  return DATE_FNS_LOCALE[useTaal()]
}
