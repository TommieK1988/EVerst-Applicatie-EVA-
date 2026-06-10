import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatKm(value: number | null | undefined, digits = 0): string {
  if (value == null) return '—'
  return value.toLocaleString('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + ' km'
}

export function formatDatum(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDatumKort(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
  })
}

const dagNamenKort = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/** Format: "ma 17 apr" — dag van de week + dagnummer + maand */
export function formatDatumMetDag(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value + 'T12:00:00')
  const dag = dagNamenKort[d.getDay()]
  const datum = d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
  return `${dag} ${datum}`
}
