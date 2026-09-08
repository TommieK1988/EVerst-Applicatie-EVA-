/**
 * Werkdagen waarop van niemand een rit geregistreerd staat.
 *
 * Aanleiding: tussen 23 juli en 31 augustus 2026 zat er geen enkele rit in de
 * database, omdat de ULU-sync zes weken niet gelopen had. Elk scherm dat op
 * ritten rekent — werktijden, km-prognose, privé-km — toonde die periode als
 * "niets aan de hand", terwijl het "niets gemeten" was. In een gesprek met een
 * medewerker is dat een gevaarlijk verschil.
 *
 * Daarom deze controle: welke werkdagen in de gekozen periode hebben nul ritten
 * van het hele wagenpark? Eén auto die niet reed zegt niets, maar geen enkele
 * auto op een doordeweekse dag betekent vrijwel altijd dat de brondata ontbreekt.
 *
 * Bewust GEEN feestdagenkalender: die zou onderhouden moeten worden en een
 * gemiste feestdag maakt de waarschuwing juist onbetrouwbaar. De tekst zegt
 * daarom dat een bouwvak of feestdag ook een verklaring kan zijn — liever een
 * waarschuwing die je wegwuift dan een gat dat je niet ziet.
 */
import 'server-only'
import { pgQuery } from '@/lib/wagenpark/db'
import { datumKort } from '@/lib/wagenpark/periode'

/** Een aaneengesloten reeks werkdagen zonder ritten. */
export type Gat = {
  van: string
  tot: string
  /** Aantal werkdagen in dit gat. */
  dagen: number
}

export type RitDekking = {
  gaten: Gat[]
  /** Totaal aantal werkdagen zonder enige ritregistratie. */
  dagenZonderData: number
}

export const VOLLEDIGE_DEKKING: RitDekking = { gaten: [], dagenZonderData: 0 }

/**
 * Werkdagen (ma t/m vr) in de periode waarop het hele wagenpark geen enkele rit
 * registreerde, gebundeld tot aaneengesloten reeksen.
 *
 * De lopende dag telt niet mee: die is nog niet af en de sync heeft hem
 * misschien nog niet opgehaald.
 */
export async function laadRitDekking(van: string, tot: string): Promise<RitDekking> {
  let rijen: { dag: string }[]
  try {
    rijen = await pgQuery<{ dag: string }>(
      `
      with dagen as (
        select d::date as dag
          from generate_series($1::date, least($2::date, current_date - 1), interval '1 day') d
         where extract(isodow from d) between 1 and 5
      )
      select dag::text as dag
        from dagen
       where not exists (
               select 1 from public.ulu_trips t where t.start_datum = dagen.dag
             )
       order by dag
      `,
      [van, tot],
    )
  } catch {
    // Fail-soft: een waarschuwing die zelf omvalt mag de pagina niet meenemen.
    return VOLLEDIGE_DEKKING
  }

  const gaten: Gat[] = []
  for (const { dag } of rijen) {
    const laatste = gaten[gaten.length - 1]
    // Aaneengesloten betekent hier: geen wérkdag ertussen met wél ritten. Een
    // weekend hoort dus niet als onderbreking te tellen, anders valt elk gat van
    // meer dan een week uiteen in losse weken.
    if (laatste && werkdagenTussen(laatste.tot, dag) === 1) {
      laatste.tot = dag
      laatste.dagen += 1
    } else {
      gaten.push({ van: dag, tot: dag, dagen: 1 })
    }
  }

  return { gaten, dagenZonderData: rijen.length }
}

/** Aantal werkdagen tussen twee dagen (exclusief `a`, inclusief `b`). */
function werkdagenTussen(a: string, b: string): number {
  const start = new Date(a + 'T12:00:00Z')
  const eind = new Date(b + 'T12:00:00Z')
  let n = 0
  const d = new Date(start)
  while (d < eind) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5) n += 1
  }
  return n
}

/** "24 jul t/m 31 aug 2026" of "12 mei 2026" bij een gat van één dag. */
export function gatLabel(gat: Gat): string {
  return gat.van === gat.tot ? datumKort(gat.van) : `${datumKort(gat.van)} t/m ${datumKort(gat.tot)}`
}
