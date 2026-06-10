import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { PROJECT_STATUSSEN } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(naam: string): string {
  return naam
    .split(' ')
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

export function formatDatum(datum: string): string {
  try {
    return format(parseISO(datum), 'd MMMM yyyy', { locale: nl })
  } catch {
    return datum
  }
}

export function formatDatumKort(datum: string): string {
  try {
    return format(parseISO(datum), 'dd-MM-yyyy')
  } catch {
    return datum
  }
}

export function nieuweId(): string {
  return crypto.randomUUID()
}

export function nieuweCode(prefix: string, volgnummer: number): string {
  return `${prefix}-${new Date().getFullYear()}-${String(volgnummer).padStart(4, '0')}`
}

export function getStatusKleur(status: string): string {
  const map: Record<string, string> = {
    aanvraag: 'bg-slate-100 text-slate-700 border-slate-300',
    offerte:  'bg-blue-50 text-blue-700 border-blue-200',
    opdracht: 'bg-everts-50 text-everts-dark border-everts-200',
  }
  return map[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

export function getDisciplineKleur(discipline: string): string {
  const map: Record<string, string> = {
    schilderwerk: 'bg-blue-50 text-blue-700',
    bouwkundig: 'bg-amber-50 text-amber-700',
    dakwerk: 'bg-slate-100 text-slate-600',
    dagelijks_onderhoud: 'bg-purple-50 text-purple-700',
    gemengd: 'bg-everts-50 text-everts-dark',
  }
  return map[discipline] ?? 'bg-slate-100 text-slate-600'
}

export function getMargeKleur(marge_pct: number): { tekst: string; balk: string } {
  if (marge_pct >= 20) return { tekst: 'text-everts', balk: 'bg-everts' }
  if (marge_pct >= 12) return { tekst: 'text-amber-600', balk: 'bg-amber-400' }
  if (marge_pct >= 0) return { tekst: 'text-red-600', balk: 'bg-red-400' }
  return { tekst: 'text-red-700 font-bold', balk: 'bg-red-600' }
}

export function truncate(str: string, max = 40): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}
