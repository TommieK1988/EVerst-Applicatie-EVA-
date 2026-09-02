/**
 * Opmaakhulpjes voor het klantportaal. Bewust een gewone module (geen
 * 'use server', geen server-only): de chat gebruikt ze ook client-side.
 */

/** 12 maart 2026 — voluit, want een klant leest dit één keer per week, niet honderd keer per dag. */
export function datum(waarde: string | null | undefined): string {
  if (!waarde) return '—'
  const d = new Date(waarde)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Korte variant voor lijsten waar de kolom smal is. */
export function datumKort(waarde: string | null | undefined): string {
  if (!waarde) return '—'
  const d = new Date(waarde)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function datumTijd(waarde: string | null | undefined): string {
  if (!waarde) return '—'
  const d = new Date(waarde)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Periode als "12 maart – 4 april 2026"; één datum als er maar één bekend is. */
export function periode(start: string | null, eind: string | null): string {
  if (!start && !eind) return 'Nog niet ingepland'
  if (start && !eind) return `Vanaf ${datum(start)}`
  if (!start && eind) return `Tot ${datum(eind)}`
  if (datum(start) === datum(eind)) return datum(start)
  return `${datum(start)} – ${datum(eind)}`
}

export function euro(bedrag: number | null | undefined): string {
  if (bedrag == null) return '—'
  return bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
}

export function bestandsgrootte(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
