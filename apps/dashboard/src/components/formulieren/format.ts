import type { FormField } from './types'

/** Eén geselecteerde medewerker in een `medewerker`-veld. */
export type MedewerkerWaarde = { id: string; naam: string }

function isLeeg(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

/** ISO-datum (YYYY-MM-DD…) → dd-mm-jjjj. */
function formatDatum(iso: string): string {
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

/** Namen uit een medewerker-veldwaarde (array van {id,naam}). */
export function medewerkerNamen(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return (value as MedewerkerWaarde[])
    .map(m => (m && typeof m === 'object' ? m.naam : String(m)))
    .filter(Boolean)
}

/**
 * Zet een veldwaarde om naar platte, leesbare tekst. Gedeeld door de
 * PDF-export en de detailweergave zodat de opmaaklogica niet dubbel staat.
 * Geeft '—' terug voor lege waarden.
 */
export function formatVeldwaardeTekst(field: FormField, value: unknown): string {
  if (isLeeg(value)) return '—'

  switch (field.type) {
    case 'boolean':
      return value === true ? 'Ja' : 'Nee'

    case 'dropdown':
    case 'radio': {
      const opt = (field.options ?? []).find(o => o.value === value)
      return opt?.label ?? String(value)
    }

    case 'checkbox': {
      const sel = Array.isArray(value) ? (value as string[]) : []
      const labels = (field.options ?? []).filter(o => sel.includes(o.value)).map(o => o.label)
      return labels.join(', ') || '—'
    }

    case 'medewerker': {
      const namen = medewerkerNamen(value)
      return namen.length ? namen.join(', ') : '—'
    }

    case 'location': {
      const loc = value as { lat: number; lng: number; adres?: string }
      if (loc && typeof loc === 'object' && typeof loc.lat === 'number') {
        return loc.adres ?? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`
      }
      return String(value)
    }

    case 'rating': {
      // Platte tekst voor detailweergave én PDF (jsPDF-standaardfont kent geen
      // ster-glyphs, dus bewust géén ★). De visuele sterren staan in het formulier zelf.
      const n = Number(value)
      if (!Number.isFinite(n)) return String(value)
      const max = field.validation?.max ?? 10
      return field.ratingStijl === 'sterren' ? `${n} / ${max} sterren` : `${n} / ${max}`
    }

    case 'date':
      return formatDatum(String(value))

    case 'file': {
      const f = value as { name?: string }
      return f && typeof f === 'object' && f.name ? f.name : '[Bestand]'
    }

    case 'photo':
    case 'signature':
      return '[Afbeelding]'

    default:
      return String(value)
  }
}
