import type { Taal } from '../talen'
import nl from './nl'

/** De vorm van alle berichten; Nederlands is de bron. */
export type Berichten = typeof nl
export type Naamruimte = keyof Berichten

/**
 * Laadt de berichten van één taal. Pools en Tamil worden pas geladen als iemand ze
 * gebruikt, zodat ze niet in elke bundel meereizen.
 */
export async function laadBerichten(taal: Taal): Promise<Berichten> {
  switch (taal) {
    case 'pl':
      return (await import('./pl')).default as unknown as Berichten
    case 'ta':
      return (await import('./ta')).default as unknown as Berichten
    default:
      return nl
  }
}

/** Alleen de opgegeven naamruimtes — voor de provider buiten /m, die maar een paar nodig heeft. */
export function kiesNaamruimtes<N extends Naamruimte>(
  berichten: Berichten,
  naamruimtes: readonly N[],
): Pick<Berichten, N> {
  const uit = {} as Pick<Berichten, N>
  for (const n of naamruimtes) uit[n] = berichten[n]
  return uit
}
