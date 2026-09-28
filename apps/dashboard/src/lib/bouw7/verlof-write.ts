/**
 * Verlof (day-off per medewerker) bijwerken of verwijderen in Bouw7 vanuit EVA.
 *
 * Aanmaken gebeurt in `lib/uren/verlof.ts` (goedgekeurde aanvraag). Dit bestand dekt wat daarna
 * komt: een planner past in de medewerkersplanning een verlof aan dat al in Bouw7 staat.
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

/** Werk een bestaande day-off bij. POST met `id` is in Bouw7 een update, geen nieuw record. */
export async function werkDayOffBijInBouw7(d: DayOffInvoer): Promise<void> {
  const client = await getBouw7ClientOfNull()
  if (!client) throw new Error('De Bouw7-koppeling is niet beschikbaar.')
  const heleDagen = !d.startTijd
  // Zelfde vorm als bij aanmaken: kale datum bij hele dagen, datetime bij een deel van de dag.
  const metTijd = (datum: string, tijd: string | null) =>
    !heleDagen && tijd ? `${datum}T${tijd.slice(0, 5)}:00` : datum
  await client.post(PAD, {
    id: Number(d.bouw7Id),
    employee: { id: d.employeeId },
    startDate: metTijd(d.startDatum, d.startTijd),
    endDate: metTijd(d.eindDatum, d.eindTijd),
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
