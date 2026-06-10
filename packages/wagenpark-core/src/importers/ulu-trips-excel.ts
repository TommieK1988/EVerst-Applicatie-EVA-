/**
 * Parser voor ULU Cartracker trips-export (xlsx).
 *
 * Verwachte kolommen (exact zoals in de export van 17-apr-2026):
 *   - Naam (bestuurder)
 *   - Kenteken
 *   - Start rit (datum)      -- DD/MM/YYYY
 *   - Start rit (tijd)       -- HH:MM:SS
 *   - Adres (start)
 *   - Stop rit (tijd)
 *   - Adres (stop)
 *   - Afstand                -- NL notatie "2,529" = 2.529 km
 *   - Tijd (totaal rit)      -- HH:MM:SS
 *   - Kilometerstand (start) -- "19.985,427"
 *   - Kilometerstand (stop)
 *   - Rit type               -- 'Zakelijk' | 'Privé' | 'Correctie' | 'Woon werk'
 *   - Score                  -- int 0-100
 */

import * as XLSX from 'xlsx'
import type { UluTripInput } from '../types'
import { normalizeKenteken, parseDurationToSeconds, parseUluAfstand, parseUluKmStand } from '../utils/distance'

export type ParsedUluTripsResult = {
  rows: UluTripInput[]
  errors: { row: number; error: string }[]
  periode: { start: string | null; eind: string | null }
}

type RawRow = Record<string, unknown>

/**
 * Converteer DD/MM/YYYY naar ISO YYYY-MM-DD. Excel kan ook Date-objects teruggeven
 * (afhankelijk van cellFormat) of een numeriek serieel getal — ondersteun allemaal.
 */
function parseDatum(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    // Excel serieel datum (dagen sinds 1900-01-00)
    const d = XLSX.SSF.parse_date_code(value)
    if (!d) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(value).trim()
  const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

function parseTijd(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    const h = String(value.getHours()).padStart(2, '0')
    const m = String(value.getMinutes()).padStart(2, '0')
    const s = String(value.getSeconds()).padStart(2, '0')
    return `${h}:${m}:${s}`
  }
  const s = String(value).trim()
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    // Zorg voor HH:MM:SS
    const parts = s.split(':')
    while (parts.length < 3) parts.push('00')
    return parts.map((p, i) => (i === 0 ? p.padStart(2, '0') : p)).join(':')
  }
  return null
}

function parseScore(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}

function normalizeRitType(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  // Fix mojibake van de Excel-export: 'Priv?' / 'Priv\ufffd' → 'Privé'
  if (s.startsWith('Priv')) return 'Privé'
  return s
}

/**
 * Parseert een xlsx-buffer en geeft ruwe rit-rijen terug.
 * Koppeling aan `voertuig_id` en `medewerker_id` gebeurt in de DB-laag.
 */
export function parseUluTripsXlsx(buffer: ArrayBuffer | Buffer): ParsedUluTripsResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null })

  const trips: UluTripInput[] = []
  const errors: { row: number; error: string }[] = []
  let minDatum: string | null = null
  let maxDatum: string | null = null

  rows.forEach((row, idx) => {
    try {
      const kenteken = normalizeKenteken(row['Kenteken'] as string)
      const startDatum = parseDatum(row['Start rit (datum)'])
      const startTijd = parseTijd(row['Start rit (tijd)'])
      if (!kenteken || !startDatum || !startTijd) {
        errors.push({
          row: idx + 2, // +2: 1 voor header, 1 voor 0-indexing
          error: `Incomplete rij: kenteken="${kenteken}" datum="${startDatum}" tijd="${startTijd}"`,
        })
        return
      }
      trips.push({
        bestuurder_naam_raw: (row['Naam (bestuurder)'] as string | null) ?? null,
        kenteken,
        start_datum: startDatum,
        start_tijd: startTijd,
        stop_tijd: parseTijd(row['Stop rit (tijd)']),
        adres_start: (row['Adres (start)'] as string | null) ?? null,
        adres_stop: (row['Adres (stop)'] as string | null) ?? null,
        afstand_km: parseUluAfstand(row['Afstand'] as string | number),
        duur_seconden: parseDurationToSeconds(row['Tijd (totaal rit)'] as string),
        km_stand_start: parseUluKmStand(row['Kilometerstand (start)'] as string | number),
        km_stand_stop: parseUluKmStand(row['Kilometerstand (stop)'] as string | number),
        rit_type_ulu: normalizeRitType(row['Rit type']),
        score: parseScore(row['Score']),
        user_id_ulu: null,
        import_batch_id: null,
      })
      if (!minDatum || startDatum < minDatum) minDatum = startDatum
      if (!maxDatum || startDatum > maxDatum) maxDatum = startDatum
    } catch (e) {
      errors.push({ row: idx + 2, error: e instanceof Error ? e.message : String(e) })
    }
  })

  return { rows: trips, errors, periode: { start: minDatum, eind: maxDatum } }
}
