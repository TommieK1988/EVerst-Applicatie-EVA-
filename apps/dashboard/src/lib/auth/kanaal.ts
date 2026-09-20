import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { KANAAL_HEADER, type Kanaal } from '@everts/database/rechten'

export type { Kanaal }

/**
 * Het kanaal van dit verzoek, gezet door de middleware uit het pad.
 *
 * Terugval is bewust `'desktop'` en niet de vereniging van beide kanalen. De
 * matcher van de middleware slaat alleen statische bestanden, /api/weather en
 * /api/nieuws over, en geen daarvan leest rechten. Een ontbrekende header
 * betekent dus een onverwachte context (prerender tijdens de build, een test,
 * een nieuwe matcher-uitzondering). Zou je dan op de vereniging terugvallen,
 * dan is een vergeten matcher-regel meteen een stille rechtenverruiming.
 */
export const getVerzoekKanaal = cache(async (): Promise<Kanaal> => {
  const waarde = (await headers()).get(KANAAL_HEADER)
  if (waarde === 'mobiel' || waarde === 'desktop') return waarde

  if (process.env.NODE_ENV === 'development') {
    console.warn(
      `[kanaal] ${KANAAL_HEADER} ontbreekt; terugval op 'desktop'. ` +
      'Draait deze code buiten de middleware-matcher?',
    )
  }
  return 'desktop'
})
