// Rooster-, week- en feestdagrekenwerk voor de urenverantwoording.
//
// Dit is de rekenkant van de weekstaat: hoeveel uren moet iemand deze week verantwoorden, en
// welke regels staan er al vast voordat hij begint (feestdagen en goedgekeurd verlof).
//
// DATUMS ZIJN HIER KALENDERDAGEN, GEEN MOMENTEN. Alle functies rekenen met 'YYYY-MM-DD'-strings
// in lokale tijd. `toISOString()` wordt bewust nergens gebruikt: die zet om naar UTC en schuift
// in de Nederlandse zomertijd een dag terug — de planning-sync is daar eerder op stukgelopen.

import { createAdminClient } from '@everts/database/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** 'YYYY-MM-DD' in lokale tijd. Nooit via toISOString: dat verschuift naar UTC. */
export function datumSleutel(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Maandag van de week waarin `d` valt. */
export function weekStartVan(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(`${d}T12:00:00`) : new Date(d)
  dt.setHours(12, 0, 0, 0) // middag: immuun voor zomertijdsprongen
  const isoDag = dt.getDay() === 0 ? 7 : dt.getDay() // zo = 7
  dt.setDate(dt.getDate() - (isoDag - 1))
  return datumSleutel(dt)
}

/** ISO-jaar en -weeknummer (ISO 8601: week 1 bevat de eerste donderdag). */
export function isoWeek(d: Date | string): { jaar: number; week: number } {
  const dt = typeof d === 'string' ? new Date(`${d}T12:00:00`) : new Date(d)
  dt.setHours(12, 0, 0, 0)
  const isoDag = dt.getDay() === 0 ? 7 : dt.getDay()
  // Naar de donderdag van deze week: die bepaalt jaar én weeknummer.
  dt.setDate(dt.getDate() + 4 - isoDag)
  const jaar = dt.getFullYear()
  const eersteJan = new Date(jaar, 0, 1, 12, 0, 0, 0)
  const week = Math.ceil(((dt.getTime() - eersteJan.getTime()) / 86400000 + 1) / 7)
  return { jaar, week }
}

/** De zeven dagen (ma t/m zo) van een week, als 'YYYY-MM-DD'. */
export function weekDagen(weekStart: string): string[] {
  const start = new Date(`${weekStart}T12:00:00`)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return datumSleutel(d)
  })
}

/** ISO-weekdag van een datumstring: 1 = maandag ... 7 = zondag. */
export function isoWeekdag(datum: string): number {
  const d = new Date(`${datum}T12:00:00`).getDay()
  return d === 0 ? 7 : d
}

export type Rooster = {
  werkdagen: number[]
  dagstart: string
  dageind: string
  contracturen_per_week: number
}

/**
 * Het rooster dat op `datum` geldt. Roosters hebben een geldigheidsvenster; bij overlap wint
 * het rooster dat het laatst begon.
 */
export async function getRooster(medewerkerId: string, datum: string): Promise<Rooster | null> {
  const supabase = db()
  const { data } = await supabase
    .from('medewerker_roosters')
    .select('werkdagen, dagstart, dageind, contracturen_per_week, geldig_vanaf, geldig_tot')
    .eq('medewerker_id', medewerkerId)
    .lte('geldig_vanaf', datum)
    .or(`geldig_tot.is.null,geldig_tot.gte.${datum}`)
    .order('geldig_vanaf', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    werkdagen: (data.werkdagen ?? []) as number[],
    dagstart: data.dagstart,
    dageind: data.dageind,
    contracturen_per_week: Number(data.contracturen_per_week ?? 0),
  }
}

/**
 * De norm voor een week: de contracturen uit het geldende rooster.
 *
 * Feestdagen verlagen de norm NIET. Ze komen als voorgevulde regel *Feestdag* in de weekstaat
 * (zie `getVoorgevuldeRegels`) en tellen daar als verantwoorde tijd. Dat houdt de rekenregel
 * uniform — één ondergrens, alles wordt met een uursoort verantwoord — en het is ook wat Bouw7
 * verwacht: die kent een uursoort Feestdag.
 *
 * Geen rooster = geen norm. Zo'n medewerker kan niets indienen; dat is bewust zichtbaar in
 * plaats van stilletjes 0 als drempel te hanteren.
 */
export async function getContracturen(
  medewerkerId: string,
  weekStart: string,
): Promise<{ uren: number; rooster: Rooster | null }> {
  const rooster = await getRooster(medewerkerId, weekStart)
  return { uren: rooster?.contracturen_per_week ?? 0, rooster }
}

/** Uren per werkdag volgens het rooster (37,5 over 5 dagen = 7,5). */
export function urenPerWerkdag(rooster: Rooster): number {
  const dagen = rooster.werkdagen.length
  if (!dagen) return 0
  return Math.round((rooster.contracturen_per_week / dagen) * 100) / 100
}

export type VoorgevuldeRegel = {
  datum: string
  uren: number
  bron: 'bouw7_feestdag' | 'bouw7_verlof'
  /** Type uit medewerker_afwezigheid, alleen bij verlof — bepaalt welke uursoort past. */
  afwezigheidType?: string
  omschrijving: string
}

/**
 * Regels die al vaststaan voordat de medewerker begint: organisatiebrede vrije dagen en
 * geregistreerde afwezigheid. Ze worden in de weekstaat voorgevuld maar blijven aanpasbaar —
 * wijkt iemand ervan af, dan markeert de weekstaat dat met `afgeweken_van_bron` zodat de
 * goedkeurder het ziet.
 *
 * Alleen roosterdagen doen mee: een feestdag op zaterdag levert voor een ma-vr-rooster niets op.
 */
export async function getVoorgevuldeRegels(
  medewerkerId: string,
  weekStart: string,
): Promise<VoorgevuldeRegel[]> {
  const supabase = db()
  const dagen = weekDagen(weekStart)
  const weekEind = dagen[6]
  const rooster = await getRooster(medewerkerId, weekStart)
  if (!rooster) return []

  const perDag = urenPerWerkdag(rooster)
  const werkdag = (datum: string) => rooster.werkdagen.includes(isoWeekdag(datum))

  // Beide queries zijn per definitie klein (één medewerker, één week): geen paginatie nodig.
  const [{ data: vrijeDagen }, { data: afwezig }] = await Promise.all([
    supabase
      .from('bouw7_vrije_dagen')
      .select('start_datum, eind_datum, naam')
      .lte('start_datum', weekEind)
      .gte('eind_datum', weekStart),
    supabase
      .from('medewerker_afwezigheid')
      .select('start_datum, eind_datum, type, opmerking')
      .eq('medewerker_id', medewerkerId)
      .lte('start_datum', weekEind)
      .gte('eind_datum', weekStart),
  ])

  const regels: VoorgevuldeRegel[] = []
  const bezet = new Set<string>()

  // Feestdagen eerst: die gaan voor op verlof. Wie op Tweede Kerstdag vakantie had staan,
  // hoort een feestdag te verantwoorden en geen vakantiedag te verspelen.
  for (const vd of (vrijeDagen ?? []) as Array<{ start_datum: string; eind_datum: string; naam: string | null }>) {
    for (const datum of dagen) {
      if (datum < vd.start_datum || datum > vd.eind_datum) continue
      if (!werkdag(datum) || bezet.has(datum)) continue
      bezet.add(datum)
      regels.push({
        datum, uren: perDag, bron: 'bouw7_feestdag',
        omschrijving: vd.naam?.trim() || 'Feestdag',
      })
    }
  }

  for (const af of (afwezig ?? []) as Array<{ start_datum: string; eind_datum: string; type: string; opmerking: string | null }>) {
    for (const datum of dagen) {
      if (datum < af.start_datum || datum > af.eind_datum) continue
      if (!werkdag(datum) || bezet.has(datum)) continue
      bezet.add(datum)
      regels.push({
        datum, uren: perDag, bron: 'bouw7_verlof',
        afwezigheidType: af.type,
        omschrijving: af.opmerking?.trim() || af.type,
      })
    }
  }

  return regels.sort((a, b) => a.datum.localeCompare(b.datum))
}
