/**
 * Verlof (day-off per medewerker) aanmaken, bijwerken of verwijderen in Bouw7 vanuit EVA, voor
 * wat een planner in de medewerkersplanning doet. Goedgekeurde verlofaanvragen gaan via
 * `lib/uren/verlof.ts`, dat fail-soft is en een herkansing via de cron kent.
 *
 * WAAROM EERST BOUW7, DAN EVA. Een rij met `bron='bouw7'` wordt bij elke sync uit Bouw7
 * overschreven, en een verwijderde rij komt terug zolang de day-off in Bouw7 bestaat. Alleen EVA
 * aanpassen zou dus tot de volgende sync blijven staan. Daarom gooien deze functies bij een
 * Bouw7-fout, en past de aanroeper EVA pas aan als Bouw7 akkoord gaf.
 */
import { getBouw7ClientOfNull } from './config'

export type DayOffInvoer = {
  bouw7Id: string
  employeeId: number
  startDatum: string
  eindDatum: string
  /** HH:MM; null bij hele dagen. */
  startTijd: string | null
  eindTijd: string | null
  uren: number
  opmerking: string | null
}

const PAD = '/organization/day-off-per-employee'

/**
 * EVA-datum (+ optionele 'HH:MM') naar de vorm die Bouw7 voor een day-off eist:
 * "2026-10-22T00:00:00+02:00" bij hele dagen, "2026-10-13T12:00:00+02:00" bij een deel van de dag.
 *
 * Een kale datum ("2027-01-25") weigert Heimdall met "This value is not a valid datetime" — zo is
 * tot oktober 2026 geen enkel goedgekeurd verlof in Bouw7 aangekomen. Bij hele dagen is de einddag
 * in Bouw7 dag-inclusief (middernacht van de laatste dag), net als `eind_datum` in EVA. De offset
 * is die van dát moment in Amsterdam, dus ook rond de wintertijdwissel goed (25 okt 2026 00:00
 * is nog +02:00, 26 okt 00:00 al +01:00).
 */
export function naarBouw7DayOffDatum(datum: string, tijd: string | null): string {
  const klok = tijd ? `${String(tijd).slice(0, 5)}:00` : '00:00:00'
  const alsUtc = Date.parse(`${datum}T${klok}Z`)
  // Twee rondes: eerst de offset bij de kloktijd-als-UTC, dan bij het echte moment dat dat oplevert.
  const min = offsetMinuten(alsUtc - offsetMinuten(alsUtc) * 60_000)
  const abs = Math.abs(min)
  const offset = `${min < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return `${datum}T${klok}${offset}`
}

/** Offset van Europe/Amsterdam t.o.v. UTC op een moment, in minuten (60 of 120). */
function offsetMinuten(ms: number): number {
  const naam = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms))
    .find(p => p.type === 'timeZoneName')?.value // "GMT+02:00"
  const m = naam?.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 60
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/**
 * Maak een nieuwe day-off aan — voor verlof dat een planner zelf in de medewerkersplanning zet.
 * Geeft het Bouw7-id terug; dat moet op de EVA-rij, anders importeert de sync hem als tweede rij.
 */
export async function maakDayOffInBouw7(d: Omit<DayOffInvoer, 'bouw7Id'>): Promise<string> {
  const res = await postDayOff(d)
  if (res?.id == null) throw new Error('Bouw7 gaf geen id terug voor het nieuwe verlof.')
  return String(res.id)
}

/** Werk een bestaande day-off bij. POST met `id` is in Bouw7 een update, geen nieuw record. */
export async function werkDayOffBijInBouw7(d: DayOffInvoer): Promise<void> {
  await postDayOff(d, d.bouw7Id)
}

async function postDayOff(d: Omit<DayOffInvoer, 'bouw7Id'>, bouw7Id?: string): Promise<{ id?: number }> {
  const client = await getBouw7ClientOfNull()
  if (!client) throw new Error('De Bouw7-koppeling is niet beschikbaar.')
  const heleDagen = !d.startTijd
  return client.post<{ id?: number }>(PAD, {
    ...(bouw7Id ? { id: Number(bouw7Id) } : {}),
    employee: { id: d.employeeId },
    startDate: naarBouw7DayOffDatum(d.startDatum, heleDagen ? null : d.startTijd),
    endDate: naarBouw7DayOffDatum(d.eindDatum, heleDagen ? null : d.eindTijd),
    isAllDay: heleDagen,
    hours: String(d.uren),
    remark: d.opmerking || 'Verlof via EVA',
  })
}

/** Verwijder een day-off. Een day-off die in Bouw7 al weg is, telt als gelukt. */
export async function verwijderDayOffInBouw7(bouw7Id: string): Promise<void> {
  const client = await getBouw7ClientOfNull()
  if (!client) throw new Error('De Bouw7-koppeling is niet beschikbaar.')
  try {
    await client.del(PAD, { id: Number(bouw7Id) })
  } catch (e) {
    if (e instanceof Error && /\b404\b|not found/i.test(e.message)) return
    throw e
  }
}
