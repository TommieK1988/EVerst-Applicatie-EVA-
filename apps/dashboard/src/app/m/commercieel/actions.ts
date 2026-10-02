'use server'

/**
 * Server-actions voor de mobiele module Commercieel.
 *
 * LET OP — elke export in dit bestand moet `async function` zijn. Een type, constante of
 * synchrone functie komt hier door `tsc` heen en valt pas om bij de build of, erger, in
 * productie. Types horen in `lib/commercie/*` en `lib/relaties/notities-types`.
 *
 * Elke action gaat zelf door een gate. De onderliggende leeslagen draaien op de admin-client
 * (service-role, bypast RLS), en een action is als kale RPC aan te roepen — de gate hier is
 * dus de enige beveiliging, niet een dubbeling van wat de pagina al deed.
 */

import { zoekKlanten, type KlantTreffer } from '@/lib/commercie/klanten-zoeken'
import { berekenServicedeskBedragen } from '@/lib/commercie/dossier-bedragen'
import { vereisCommercieelMutatie } from '@/lib/commercie/mobiel-auth'

type Uitkomst<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Zoek een opdrachtgever. Gooit niet maar geeft een foutmelding terug: dit draait onder een
 * typende gebruiker, en een uitzondering zou het hele zoekscherm omver halen.
 *
 * De gate staat in `zoekKlanten` zelf (die geeft een lege lijst zonder recht); hier vangen we
 * alleen onverwachte fouten af.
 */
export async function zoekKlantenActie(term: string): Promise<Uitkomst<KlantTreffer[]>> {
  try {
    const data = await zoekKlanten(term)
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Zoeken lukte niet. Probeer het zo nog eens.' }
  }
}

/**
 * Bedragen van de lopende servicedeskbonnen, na de eerste weergave opgehaald — te duur om de
 * pagina op te laten wachten (zie `lib/commercie/dossier-bedragen.ts`).
 *
 * Zelfde gate als de pagina: `relaties` lezen. De bedragen staan voor diezelfde mensen al op
 * het klantbeeld; deze action zet er niets nieuws mee open, en rekent hooguit
 * `MAX_LOPENDE_BONNEN` bonnen per aanroep door.
 */
export async function laadServicedeskBedragenActie(
  dossierIds: string[],
): Promise<Uitkomst<Record<string, number | null>>> {
  try {
    await vereisCommercieelMutatie('lezen')
    return { ok: true, data: await berekenServicedeskBedragen(dossierIds) }
  } catch {
    return { ok: false, error: 'Bedragen ophalen lukte niet.' }
  }
}
