/**
 * Gedeelde veldinterpretatie voor de ULU parkeer-exports (xlsx én csv).
 *
 * Beide exports bevatten dezelfde kolommen, maar leveren de waarden anders aan:
 * xlsx geeft Date-objecten of Excel-seriële getallen, csv geeft alleen tekst.
 * De interpretatie hoort daarom op één plek te staan — twee parsers die
 * uiteenlopen is precies hoe importbugs ontstaan.
 *
 * Verwachte kolommen:
 *   Parkeerlocatie · Naam voertuig · Kenteken · Parkeer starttijd ·
 *   Parkeerkosten · Parkeer duur
 */

import * as XLSX from 'xlsx'
import type { UluParkingInput } from '../types'
import { normalizeKenteken, parseDurationToSeconds } from '../utils/distance'

export type RawRow = Record<string, unknown>

export const PARKING_KOLOMMEN = {
  locatie: 'Parkeerlocatie',
  kenteken: 'Kenteken',
  starttijd: 'Parkeer starttijd',
  kosten: 'Parkeerkosten',
  duur: 'Parkeer duur',
} as const

/**
 * Wandkloktijd in Nederland → UTC-instant.
 *
 * WAAROM DIT NIET `new Date(...)` MAG ZIJN — een parkeer-export bevat lokale
 * tijd zonder zone-aanduiding. `new Date('2026-09-08 14:03:00')` interpreteert
 * die in de tijdzone van de *server*. Lokaal (Windows, CEST) levert dat 12:03
 * UTC op, op Vercel (UTC) 14:03 UTC: dezelfde export wordt twee uur verschoven
 * ingelezen, afhankelijk van waar de import toevallig draait.
 *
 * De bestaande parkeerdata is via een lokale machine ingelezen en staat daarom
 * goed (gemeten: mediaan 0 minuten tussen rit-einde en parkeerstart). Zodra de
 * import naar de cron verhuist zou dat stilletjes scheeflopen. Vandaar deze
 * expliciete conversie, die ook de zomertijd-overgang goed afhandelt.
 */
export function amsterdamsTijdstipNaarIso(
  jaar: number,
  maand: number,
  dag: number,
  uur = 0,
  minuut = 0,
  seconde = 0,
): string | null {
  const alsofUtc = Date.UTC(jaar, maand - 1, dag, uur, minuut, seconde)
  if (!Number.isFinite(alsofUtc)) return null

  // Twee rondes: de offset hangt af van het moment zelf (zomer- of wintertijd).
  // De eerste correctie kan net over een DST-grens springen; de tweede vangt dat op.
  let ms = alsofUtc - offsetMs(new Date(alsofUtc))
  const tweedeOffset = offsetMs(new Date(ms))
  ms = alsofUtc - tweedeOffset

  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Hoeveel ms loopt Europe/Amsterdam vóór op UTC, op dit moment? */
function offsetMs(moment: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const deel: Record<string, number> = {}
  for (const p of dtf.formatToParts(moment)) {
    if (p.type !== 'literal') deel[p.type] = Number(p.value)
  }
  const alsUtc = Date.UTC(
    deel.year,
    deel.month - 1,
    deel.day,
    deel.hour,
    deel.minute,
    deel.second,
  )
  return alsUtc - moment.getTime()
}

/**
 * Parseert een parkeer-starttijd naar ISO (UTC). Accepteert wat de twee bronnen
 * opleveren: een Date uit SheetJS' `cellDates`, een Excel-serieel getal, of
 * tekst in NL- of ISO-notatie. Alles wordt als Nederlandse wandkloktijd gelezen.
 *
 * Let op bij het Date-object: SheetJS bouwt dat met `cellDates: true` op in de
 * *lokale* tijdzone van het proces, dus we lezen de lokale velden er weer uit en
 * behandelen die als wandkloktijd. Zo geeft dezelfde cel overal dezelfde uitkomst.
 */
export function parseParkeerTijdstip(value: unknown): string | null {
  if (value == null || value === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return amsterdamsTijdstipNaarIso(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
    )
  }

  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    if (!d) return null
    return amsterdamsTijdstipNaarIso(d.y, d.m, d.d, d.H, d.M, Math.floor(d.S))
  }

  return parseTijdstipTekst(String(value).trim())
}

/**
 * "08-09-2026 14:03", "8/9/2026 14:03:12", "2026-09-08T14:03:00" of
 * "2026-09-08 13:41:14 UTC" → ISO.
 *
 * Dat laatste is wat ULU in de dagelijkse CSV-export zet: de tijd staat er in
 * UTC, mét die aanduiding erachter. Wordt het achtervoegsel niet herkend, dan
 * leest de parser hem als Nederlandse wandklok en staat elke parkeerkost er in
 * de zomer twee uur naast — genoeg om hem aan de verkeerde rit (en dus het
 * verkeerde project) te koppelen.
 */
export function parseTijdstipTekst(tekst: string): string | null {
  if (!tekst) return null

  // Draagt de tekst zelf een zone (Z, ±hh:mm of een expliciete UTC/GMT), dan is
  // het al eenduidig en hoeft er niets omgerekend te worden.
  const utcAchtervoegsel = /\s+(?:UTC|GMT)$/i
  if (utcAchtervoegsel.test(tekst)) {
    const d = new Date(tekst.replace(utcAchtervoegsel, '').replace(' ', 'T') + 'Z')
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(tekst)) {
    const d = new Date(tekst)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  const m = tekst.match(
    /^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (!m) return null

  const [, a, b, c, uur, min, sec] = m
  // Vier cijfers vooraan = ISO (jjjj-mm-dd), anders NL (dd-mm-jjjj).
  const isIso = a.length === 4
  const jaar = Number(isIso ? a : c)
  const maand = Number(b)
  const dag = Number(isIso ? c : a)
  if (!jaar || !maand || !dag || maand > 12 || dag > 31) return null

  return amsterdamsTijdstipNaarIso(
    jaar,
    maand,
    dag,
    Number(uur ?? 0),
    Number(min ?? 0),
    Number(sec ?? 0),
  )
}

/** "€ 2,50", "2.50", 2.5 → 2.5. Leeg of onleesbaar → null. */
export function parseParkeerKosten(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  let s = String(value).replace(/[^\d,.-]/g, '')
  if (!s) return null

  // NL-notatie: punt is duizendscheiding zodra er ook een komma staat.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')

  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

/** Leest een kolom ongeacht hoofdletters of dubbele spaties in de kop. */
export function leesKolom(row: RawRow, kolom: string): unknown {
  if (kolom in row) return row[kolom]
  const genormaliseerd = kolom.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase().replace(/\s+/g, ' ').trim() === genormaliseerd) return v
  }
  return null
}

/** Uitkomst van beide parsers — één vorm, zodat aanroepers ze niet uit elkaar houden. */
export type ParsedUluParkingResult = {
  rows: UluParkingInput[]
  errors: { row: number; error: string }[]
  periode: { start: string | null; eind: string | null }
}

/**
 * Zet ruwe rijen (uit xlsx of csv) om naar parkeerregels.
 *
 * Een onleesbare rij laat de rest doorgaan: bij een export van honderden regels
 * is één rare regel geen reden om de hele dag te laten mislukken. De fout wordt
 * per rij teruggegeven met het regelnummer zoals de gebruiker het in het bestand
 * ziet (kopregel = 1, dus +2).
 */
export function rijenNaarParkingResultaat(rows: RawRow[]): ParsedUluParkingResult {
  const out: UluParkingInput[] = []
  const errors: { row: number; error: string }[] = []
  let minDatum: string | null = null
  let maxDatum: string | null = null

  rows.forEach((row, idx) => {
    try {
      const kenteken = normalizeKenteken(leesKolom(row, PARKING_KOLOMMEN.kenteken) as string)
      const starttijd = parseParkeerTijdstip(leesKolom(row, PARKING_KOLOMMEN.starttijd))
      if (!kenteken || !starttijd) {
        errors.push({
          row: idx + 2,
          error: `Incomplete rij: kenteken="${kenteken}" starttijd="${starttijd}"`,
        })
        return
      }

      out.push({
        kenteken,
        parkeer_starttijd: starttijd,
        parkeerlocatie: (leesKolom(row, PARKING_KOLOMMEN.locatie) as string | null) ?? null,
        parkeerkosten: parseParkeerKosten(leesKolom(row, PARKING_KOLOMMEN.kosten)),
        duur_seconden: parseDurationToSeconds(
          leesKolom(row, PARKING_KOLOMMEN.duur) as string | null,
        ),
        import_batch_id: null,
      })

      // De periode is bedoeld voor de importregistratie en wordt in NL-dagen
      // gelezen, niet in UTC — anders valt een parkeeractie van 00:30 op de dag ervoor.
      const datum = isoNaarAmsterdamseDatum(starttijd)
      if (datum) {
        if (!minDatum || datum < minDatum) minDatum = datum
        if (!maxDatum || datum > maxDatum) maxDatum = datum
      }
    } catch (e) {
      errors.push({ row: idx + 2, error: e instanceof Error ? e.message : String(e) })
    }
  })

  return { rows: out, errors, periode: { start: minDatum, eind: maxDatum } }
}

/** ISO-instant → de kalenderdag zoals die in Nederland op de klok stond (jjjj-mm-dd). */
export function isoNaarAmsterdamseDatum(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return dtf.format(d) // en-CA geeft jjjj-mm-dd
}
