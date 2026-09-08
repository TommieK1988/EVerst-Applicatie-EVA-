/**
 * Eén ingang voor de ULU parkeer-export, ongeacht het formaat.
 *
 * De dagelijkse mail van ULU bevat een CSV, de handmatige download uit het
 * ULU-dashboard een xlsx. Aanroepers (de uploadknop en de mail-cron) hoeven dat
 * onderscheid niet te kennen — anders moet elke nieuwe ingang het opnieuw maken.
 */

import { parseUluParkingXlsx } from './ulu-parking-excel'
import { parseUluParkingCsv } from './ulu-parking-csv'
import type { ParsedUluParkingResult } from './ulu-parking-velden'

/** Een xlsx is een zip en begint altijd met "PK"; een csv nooit. */
export function isXlsxBestand(buffer: Buffer, bestandsnaam?: string): boolean {
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return true
  return (bestandsnaam ?? '').toLowerCase().endsWith('.xlsx')
}

/**
 * Parseert een parkeer-export. `tekst` is de al gedecodeerde inhoud voor het
 * CSV-pad; die decodering (Windows-1252 vs UTF-8) gebeurt in de app, omdat
 * `iconv-lite` daar zit en niet in dit package.
 */
export function parseUluParkingBestand(
  buffer: Buffer,
  bestandsnaam: string,
  tekst: () => string,
): ParsedUluParkingResult {
  return isXlsxBestand(buffer, bestandsnaam)
    ? parseUluParkingXlsx(buffer)
    : parseUluParkingCsv(tekst())
}
