/**
 * Parser voor de ULU Cartracker parking-export (xlsx).
 *
 * De veldinterpretatie zit in `ulu-parking-velden.ts` en wordt gedeeld met de
 * CSV-variant; hier staat alleen het uitpakken van de werkmap.
 *
 * Verwachte kolommen:
 *   - Parkeerlocatie
 *   - Naam voertuig
 *   - Kenteken
 *   - Parkeer starttijd       -- Date/Time
 *   - Parkeerkosten           -- numeriek (mag null zijn)
 *   - Parkeer duur            -- HH:MM:SS
 */

import * as XLSX from 'xlsx'
import {
  rijenNaarParkingResultaat,
  type ParsedUluParkingResult,
  type RawRow,
} from './ulu-parking-velden'

export type { ParsedUluParkingResult }

export function parseUluParkingXlsx(buffer: ArrayBuffer | Buffer): ParsedUluParkingResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) {
    return {
      rows: [],
      errors: [{ row: 1, error: 'Geen tabblad gevonden in het bestand.' }],
      periode: { start: null, eind: null },
    }
  }

  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null })
  return rijenNaarParkingResultaat(rows)
}
