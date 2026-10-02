import type { Berichten } from './berichten'
import type { Taal } from './talen'

/**
 * Maakt `useTranslations('planning')` en `t('titel')` typeveilig: een sleutel die niet in de
 * Nederlandse berichten staat is een typefout. Nederlands is de bron; Pools en Tamil worden
 * daar door de pariteitstest tegen gecontroleerd.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Taal
    Messages: Berichten
  }
}
