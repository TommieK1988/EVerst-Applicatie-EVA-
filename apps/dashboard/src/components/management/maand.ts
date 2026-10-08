/** Maandnotatie voor vastgestelde periodes ('YYYY-MM-DD', eerste dag van de maand). */

function datumVan(periode: string): Date | null {
  const m = /^(\d{4})-(\d{2})/.exec(periode)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : null
}

/** "september 2026" */
export function maandLabel(periode: string): string {
  const d = datumVan(periode)
  return d ? d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) : periode
}

/** "sep 26" */
export function maandKort(periode: string): string {
  const d = datumVan(periode)
  return d ? d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }) : periode
}

/** 'YYYY-MM' — de vorm die in de URL staat. */
export function maandParam(periode: string): string {
  return periode.slice(0, 7)
}
