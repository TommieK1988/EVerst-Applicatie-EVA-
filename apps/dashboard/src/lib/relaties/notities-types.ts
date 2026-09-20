/**
 * Types voor gespreksnotities op een relatie.
 *
 * Losse module en geen deel van `notities-actions.ts`: dat is een `'use server'`-bestand, en
 * daar mag alleen async worden geëxporteerd. Een type of constante die daar tussen staat komt
 * door `tsc` heen en valt pas om bij de build — zie de kop van `lib/materieel/types.ts` voor
 * dezelfde reden.
 *
 * Client-veilig: geen `server-only`, geen DB-imports. De mobiele sheet en het desktopblok
 * gebruiken dezelfde vorm.
 */

export type RelatieNotitie = {
  id: string
  inhoud: string
  created_at: string
  medewerker_id: string | null
  auteur_naam: string
  /** Bij wie het gesprek was; leeg als de notitie over de klant als geheel gaat. */
  contactpersoon_id: string | null
  contactpersoon_naam: string | null
}

/** Uitkomst van de schrijfacties — zelfde vorm als de rest van de mobiele actions. */
export type NotitieResultaat =
  | { ok: true; notitie: RelatieNotitie }
  | { ok: false; error: string }

export type VerwijderResultaat = { ok: true } | { ok: false; error: string }
