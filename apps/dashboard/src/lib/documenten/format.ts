/**
 * format.ts — pure helpers voor de documenten-module.
 *
 * Client-veilig en zonder server-imports, zodat zowel de server-side contextbouwer
 * als de demo-context (en desgewenst de UI) ze kan gebruiken.
 *
 * Bewust lokaal en niet uit `quote-renderer.ts`: die formatters zijn daar niet
 * geëxporteerd en die module is diep offerte-specifiek. Dit zijn dezelfde
 * nl-NL-conventies.
 */

import type { DocumentVeld } from './types'

const EUR_FMT = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** Bedrag als "€ 1.234,50"; lege/ongeldige invoer → "€ 0,00". */
export function euroNL(n: number | null | undefined): string {
  return EUR_FMT.format(Number(n) || 0)
}

/** Getal met n decimalen in nl-NL ("12,50"); lege invoer → ''. */
export function getalNL(n: number | null | undefined, decimalen = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return ''
  return Number(n).toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen })
}

/** Kapt tekst af op een woordgrens en zet er … achter. Leeg blijft leeg. */
export function afkappen(tekst: string | null | undefined, max: number): string {
  const s = String(tekst ?? '').trim()
  if (s.length <= max) return s
  const knip = s.slice(0, max)
  const spatie = knip.lastIndexOf(' ')
  return (spatie > max * 0.6 ? knip.slice(0, spatie) : knip).trimEnd() + '…'
}

/** Datum als "14 juli 2026"; lege/ongeldige invoer → ''. */
export function datumNL(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Datum als "2026-07-14" (ISO-dag); lege/ongeldige invoer → ''. */
export function datumISO(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/** Datum + n jaar (n mag fractioneel zijn: 0,5 jaar = 6 maanden). */
export function nJaarLater(iso: string | null | undefined, jaren: number): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const uit = new Date(d)
  uit.setMonth(uit.getMonth() + Math.round(jaren * 12))
  return uit.toISOString()
}

/**
 * Normaliseert de door de gebruiker ingevulde waarden tegen de velddefinitie van
 * het sjabloon: onbekende sleutels vallen af, ontbrekende velden krijgen hun
 * standaardwaarde. Alles wordt string (Word toont tekst).
 */
export function normaliseerInvoer(
  velden: DocumentVeld[],
  invoer: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const uit: Record<string, string> = {}
  for (const veld of velden ?? []) {
    const ruw = invoer?.[veld.sleutel]
    const waarde = ruw == null || ruw === '' ? (veld.standaard ?? '') : ruw
    uit[veld.sleutel] =
      veld.type === 'datum' ? datumNL(String(waarde)) :
      typeof waarde === 'boolean' ? (waarde ? 'Ja' : 'Nee') :
      // Checkbox-waarden komen uit de UI als 'true'/'false'-string.
      veld.type === 'checkbox' ? (String(waarde) === 'true' ? 'Ja' : 'Nee') :
      String(waarde)
  }
  return uit
}

/** Ontbrekende verplichte velden; leeg = alles ingevuld. */
export function ontbrekendeVelden(
  velden: DocumentVeld[],
  invoer: Record<string, unknown> | null | undefined,
): string[] {
  return (velden ?? [])
    .filter(v => v.verplicht)
    .filter(v => {
      const w = invoer?.[v.sleutel] ?? v.standaard
      return w == null || String(w).trim() === ''
    })
    .map(v => v.label || v.sleutel)
}

/** Volledige naam uit voornaam/tussenvoegsel/achternaam. */
export function volledigeNaam(
  r: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null } | null | undefined,
): string {
  if (!r) return ''
  return [r.voornaam, r.tussenvoegsel, r.achternaam].filter(Boolean).join(' ').trim()
}
