/**
 * De indeling van de opschoonronde (okt 2026, besloten door de directie):
 *  - bak A: langer dan een jaar verzonden en nooit contact vastgelegd. Onder € 30k staan ze
 *    standaard aangevinkt om te laten vervallen; vanaf € 30k bekijk je ze eerst per stuk;
 *  - bak B: drie maanden tot een jaar, of ouder mét contact. Per stuk beslissen;
 *  - jonger dan drie maanden: gewoon werk, die lopen via Te doen en staan hier niet.
 */

import type { TeDoenRij } from './te-doen'

export const OPSCHONEN_VANAF_DAGEN = 90
export const BAK_A_VANAF_DAGEN = 365
export const BAK_A_BEKIJKEN_VANAF = 30_000

export function deelInBakken(
  rijen: TeDoenRij[],
  heeftContact: (id: string) => boolean,
): { a: TeDoenRij[]; b: TeDoenRij[] } {
  const a: TeDoenRij[] = []
  const b: TeDoenRij[] = []
  for (const r of rijen) {
    const dagen = r._openDagen
    if (dagen == null || dagen < OPSCHONEN_VANAF_DAGEN) continue
    if (dagen >= BAK_A_VANAF_DAGEN && !heeftContact(r.id)) a.push(r)
    else b.push(r)
  }
  const opLeeftijd = (x: TeDoenRij, y: TeDoenRij) => (y._openDagen ?? 0) - (x._openDagen ?? 0)
  return { a: a.sort(opLeeftijd), b: b.sort(opLeeftijd) }
}

/** Wat bij het openen al is aangevinkt: bak A onder de grens. */
export function standaardSelectie(a: TeDoenRij[]): Set<string> {
  return new Set(a.filter(r => (r._bedrag ?? 0) < BAK_A_BEKIJKEN_VANAF).map(r => r.id))
}
