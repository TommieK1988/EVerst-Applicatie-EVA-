/**
 * Gedeelde, compacte tabel-bouwstenen voor de financiële dossier-tabs (Inkoop/Verkoop/Uren).
 * Gemodelleerd op het patroon in FinancieelTab.tsx zodat de tabs visueel consistent zijn.
 */
import type React from 'react'

export const ROOD = '#d9534f'
export const GROEN = '#009439'

export const toNum = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isNaN(n) ? 0 : n
}

export const fmt = (v: unknown, showZero = false): string => {
  const n = toNum(v)
  if (n === 0 && !showZero) return '—'
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

export const fmtUren = (v: number | null, showZero = false): string => {
  if (v == null) return '—'
  if (v === 0 && !showZero) return '—'
  return `${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v)} u`
}

export const fmtTarief = (v: number | null): string => {
  if (v == null || v === 0) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

export const fmtDatum = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export const fmtPct = (v: number | null): string => {
  if (v == null) return '—'
  return `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(v)} %`
}

export const TH = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
  <th style={{
    padding: '7px 12px', textAlign: right ? 'right' : 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid var(--neutral-200, #e3e8ea)', whiteSpace: 'nowrap',
  }}>
    {children}
  </th>
)

export const TD = ({ children, right, vet, accent, kleur }: {
  children: React.ReactNode; right?: boolean; vet?: boolean; accent?: boolean; kleur?: string
}) => (
  <td style={{
    padding: '6px 12px', fontSize: 13, textAlign: right ? 'right' : 'left', fontWeight: vet ? 700 : 400,
    color: kleur ?? (accent ? 'var(--accent)' : vet ? 'var(--neutral-900)' : 'var(--neutral-700)'),
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  }}>
    {children}
  </td>
)

/** Lege/niet-beschikbaar-staat, identiek aan het patroon in FinancieelTab. */
export const LegeStaat = ({ titel, tekst }: { titel: string; tekst: string }) => (
  <div style={{
    padding: '32px 28px', border: '1px dashed var(--neutral-200)', borderRadius: 10,
    background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 10, color: 'var(--neutral-500)',
  }}>
    <div style={{ fontSize: 24, opacity: 0.4 }}>◻</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-800)' }}>{titel}</div>
    <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: 320 }}>{tekst}</div>
  </div>
)
