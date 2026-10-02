import type {
  KWALITEIT_LOCATIE_SUGGESTIES,
  KWALITEIT_WAARNEMING_SUGGESTIES,
} from '@everts/database/kwaliteit-types'

/**
 * Sleutels voor de vaste snelkeuzes in de kwaliteitsronde.
 *
 * De opgeslagen waarde blijft de Nederlandse tekst — die komt zo in het rapport en op kantoor. Alleen
 * de knop toont de vertaling uit `kwaliteit.locatieSuggestie` / `kwaliteit.waarnemingSuggestie`.
 * Exhaustive Record: een nieuwe suggestie in de database-package dwingt hier een sleutel af.
 */
export const LOCATIE_SLEUTEL = {
  'Voorgevel': 'voorgevel',
  'Achtergevel': 'achtergevel',
  'Zijgevel links': 'zijgevelLinks',
  'Zijgevel rechts': 'zijgevelRechts',
  'Kopgevel': 'kopgevel',
  'Dak': 'dak',
  'Dakrand': 'dakrand',
  'Balkon': 'balkon',
  'Entree': 'entree',
  'Blok A': 'blokA',
  'Blok B': 'blokB',
  'Verdieping 1': 'verdieping1',
  'Verdieping 2': 'verdieping2',
  'Begane grond': 'beganeGrond',
} as const satisfies Record<(typeof KWALITEIT_LOCATIE_SUGGESTIES)[number], string>

export const WAARNEMING_SLEUTEL = {
  'Strak schilderwerk': 'schilderwerk',
  'Goede houtreparatie': 'houtreparatie',
  'Nette kitvoeg': 'kitvoeg',
  'Verzorgd voegwerk': 'voegwerk',
  'Correct dakdetail': 'dakdetail',
  'Schoon werkgebied': 'werkgebied',
  'Nette aansluiting tussen disciplines': 'aansluiting',
} as const satisfies Record<(typeof KWALITEIT_WAARNEMING_SUGGESTIES)[number], string>

/** Sleutel bij een (opgeslagen) tekst, of null als het eigen invoer is. */
export function suggestieSleutel<T extends Record<string, string>>(
  lijst: T,
  tekst: string | null | undefined,
): T[keyof T] | null {
  if (!tekst) return null
  return Object.prototype.hasOwnProperty.call(lijst, tekst) ? lijst[tekst as keyof T] : null
}
