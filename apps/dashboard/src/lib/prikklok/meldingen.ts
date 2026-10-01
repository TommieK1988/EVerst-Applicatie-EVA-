import 'server-only'
import { getAppVertaler } from '@/i18n/server'
import type { Berichten } from '@/i18n/berichten'

export type MeldingSleutel = keyof Berichten['prikklok']['melding']

/**
 * Melding van de prikklok-acties in de taal van de ingelogde medewerker. De prikklok draait
 * alleen in EVA Mobiel, dus deze teksten zien alleen monteurs.
 *
 * Getallen en tijden komen als tekst binnen (al opgemaakt): ICU zou een jaartal of afstand
 * anders met duizendtallen opmaken.
 */
export async function melding(sleutel: MeldingSleutel, waarden?: Record<string, string>): Promise<string> {
  const t = await getAppVertaler('prikklok')
  // Eén generieke ingang voor alle sleutels; de pariteitstest bewaakt de variabelen per taal.
  return (t as unknown as (s: string, w?: Record<string, string>) => string)(`melding.${sleutel}`, waarden)
}
