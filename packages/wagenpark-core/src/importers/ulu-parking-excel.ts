/**
 * Parser voor ULU Cartracker parking-export (xlsx).
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
import type { UluParkingInput } from '../types'
import { normalizeKenteken, parseDurationToSeconds } from '../utils/distance'

export type ParsedUluParkingResult = {
  rows: UluParkingInput[]
  errors: { row: number; error: string }[]
  periode: { start: string | null; eind: string | null }
}

type RawRow = Record<string, unknown>

function parseTimestamp(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') {
    // Excel serieel datum+tijd
    const d = XLSX.SSF.parse_date_code(value)
    if (!d) return null
    const iso = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}T${String(d.H).padStart(2, '0')}:${String(d.M).padStart(2, '0')}:${String(Math.floor(d.S)).padStart(2, '0')}`
    return new Date(iso).toISOString()
  }
  const s = String(value).trim()
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  return null
}

function parseKosten(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const s = String(value).replace(/[^\d,.-]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

export function parseUluParkingXlsx(buffer: ArrayBuffer | Buffer): ParsedUluParkingResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null })

  const out: UluParkingInput[] = []
  const errors: { row: number; error: string }[] = []
  let minTs: string | null = null
  let maxTs: string | null = null

  rows.forEach((row, idx) => {
    try {
      const kenteken = normalizeKenteken(row['Kenteken'] as string)
      const starttijd = parseTimestamp(row['Parkeer starttijd'])
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
        parkeerlocatie: (row['Parkeerlocatie'] as string | null) ?? null,
        parkeerkosten: parseKosten(row['Parkeerkosten']),
        duur_seconden: parseDurationToSeconds(row['Parkeer duur'] as string),
        import_batch_id: null,
      })
      const datePart = starttijd.slice(0, 10)
      if (!minTs || datePart < minTs) minTs = datePart
      if (!maxTs || datePart > maxTs) maxTs = datePart
    } catch (e) {
      errors.push({ row: idx + 2, error: e instanceof Error ? e.message : String(e) })
    }
  })

  return { rows: out, errors, periode: { start: minTs, eind: maxTs } }
}
