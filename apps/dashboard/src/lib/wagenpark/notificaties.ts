import 'server-only'
import { pgQuery } from './db'
import { stuurPush } from '@/lib/notificaties/push'

/**
 * Gedeelde helpers voor wagenpark-meldingen (in-app belletje).
 *
 * Ontvangers = Directie (afdeling), beheerders (instellingen=beheren) of
 * wagenpark=beheren — dezelfde doelgroep als de werktijd-signalen in
 * wagenpark/actions/compliance.ts. Inserts gaan via de directe pooler,
 * consistent met de rest van de wagenpark-module.
 */

/** Auth-user-ids van alle Directie/beheer-ontvangers. */
export async function beheerOntvangers(): Promise<string[]> {
  const rows = await pgQuery<{ auth_user_id: string }>(
    `
    select distinct m.auth_user_id::text as auth_user_id
      from public.medewerkers m
      left join public.medewerker_afdelingen ad on ad.naam = m.afdeling and ad.actief = true
     where m.actief = true
       and m.auth_user_id is not null
       and (
         lower(coalesce(m.afdeling, '')) = 'directie'
         or coalesce(m.rechten_override->>'instellingen', ad.standaard_rechten->>'instellingen') = 'beheren'
         or coalesce(m.rechten_override->>'wagenpark', ad.standaard_rechten->>'wagenpark') = 'beheren'
       )
    `,
  )
  return rows.map((r) => r.auth_user_id)
}

/** Maak één in-app melding per ontvanger. Geeft het aantal verzonden meldingen. */
export async function maakWagenparkMelding(
  ontvangers: string[],
  titel: string,
  body: string,
  url: string,
): Promise<number> {
  let verzonden = 0
  for (const uid of ontvangers) {
    await pgQuery(
      `insert into public.notificaties (user_id, type, titel, body, url, gelezen)
       values ($1, 'algemeen', $2, $3, $4, false)`,
      [uid, titel, body, url],
    )
    // De insert loopt via de pooler, dus de push gaat er los achteraan in plaats
    // van via lib/notificaties/maak.ts.
    await stuurPush(uid, { titel, body, url, type: 'algemeen' })
    verzonden++
  }
  return verzonden
}
