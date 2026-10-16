/**
 * Alle rijen van een Supabase-query ophalen, ook voorbij de 1000e.
 *
 * WAAROM DIT BESTAAT — lees dit voordat je een `.select()` zonder filter schrijft.
 *
 * PostgREST kapt elke respons af op `max-rows` (bij ons 1000). Dat gebeurt **stil**: je krijgt
 * geen error, geen waarschuwing, geen `error`-veld — gewoon 1000 rijen in plaats van alles.
 * Code die daarop rekent lijkt te werken zolang de tabel klein is en gaat er ongemerkt naast
 * zodra hij groeit. Een `.limit(20000)` helpt niet: de servergrens wint.
 *
 * Dat is in productie misgegaan op de Medewerkerplanning: `planning_items` groeide naar 1214
 * rijen, de pagina haalde er 1000 op, en 214 planitems verdwenen uit beeld. Voor de gebruiker
 * zag dat eruit als "de Bouw7-sync mist dingen" — een lege regel bij een medewerker die in
 * Bouw7 wél vol stond. Er is dagen naar de verkeerde oorzaak gezocht.
 *
 * GEBRUIK — geef een functie die `.range()` op je query zet:
 *
 *   const items = await haalAlleRijen<PlanningItem>((van, tot) =>
 *     supabase.from('planning_items').select('*').order('id').range(van, tot))
 *
 * LET OP: **altijd een stabiele `.order()`** meegeven. Zonder vaste sortering mag Postgres per
 * pagina een andere volgorde teruggeven, en dan sla je rijen over of haal je ze dubbel op.
 */

const PAGINA = 1000

/** Veiligheidsgrens tegen een oneindige lus als een query zich onverwacht gedraagt. */
const MAX_PAGINAS = 100

type PaginaResultaat<T> = { data: T[] | null; error: { message: string; code?: string } | null }

export async function haalAlleRijen<T>(
  pagina: (van: number, tot: number) => PromiseLike<PaginaResultaat<T>>,
): Promise<T[]> {
  const alles: T[] = []

  for (let i = 0; i < MAX_PAGINAS; i++) {
    const van = i * PAGINA
    const { data, error } = await pagina(van, van + PAGINA - 1)

    // Bewust gooien en niet stil doorgaan: een halve dataset is precies de fout die deze
    // helper moet voorkomen. Beter een zichtbare fout dan een pagina die klopt-op-het-oog.
    // De Postgres-foutcode gaat mee in de tekst, zodat aanroepers die op een specifieke code
    // reageren (bv. 42P01 "tabel bestaat niet") dat na het vangen nog kunnen zien.
    if (error) {
      const code = error.code ? ` [${error.code}]` : ''
      throw new Error(`Pagineren mislukt vanaf rij ${van}${code}: ${error.message}`)
    }

    const rijen = data ?? []
    alles.push(...rijen)
    if (rijen.length < PAGINA) return alles
  }

  throw new Error(`Pagineren gestopt na ${MAX_PAGINAS} pagina's (${alles.length} rijen) — query te breed?`)
}

/**
 * Zoveel id's gaan er in één `.in()`. Elke uuid kost ~37 tekens in de URL en rond de 19 kB
 * weigert de proxy de aanvraag (zie `IDS_PER_QUERY` in lib/debiteuren/actions.ts); met 150
 * blijft een aanvraag daar ruim onder, ook met de rest van de query erbij.
 */
export const IDS_PER_BLOK = 150

/** Een id-lijst (ontdubbeld) in blokken van `IDS_PER_BLOK`. */
export function inBlokken(ids: string[]): string[][] {
  const uniek = [...new Set(ids)]
  const blokken: string[][] = []
  for (let i = 0; i < uniek.length; i += IDS_PER_BLOK) blokken.push(uniek.slice(i, i + IDS_PER_BLOK))
  return blokken
}

/**
 * `haalAlleRijen` voor een `.in()` met een lange id-lijst: de id's gaan in blokken (URL-limiet)
 * en elk blok wordt gepagineerd, want één blok dossier-id's kan zelf meer dan 1000 rijen
 * opleveren. Ook hier een stabiele `.order()` meegeven. De volgorde over de blokken heen is
 * niet die van de `.order()`: sorteer achteraf als dat ertoe doet.
 *
 *   const taken = await haalAlleRijenVoorIds<Taak>(dossierIds, (blok, van, tot) =>
 *     supabase.from('tasks').select('*').in('dossier_id', blok).order('id').range(van, tot))
 */
export async function haalAlleRijenVoorIds<T>(
  ids: string[],
  pagina: (blok: string[], van: number, tot: number) => PromiseLike<PaginaResultaat<T>>,
): Promise<T[]> {
  const perBlok = await Promise.all(
    inBlokken(ids).map(blok => haalAlleRijen<T>((van, tot) => pagina(blok, van, tot))),
  )
  return perBlok.flat()
}
