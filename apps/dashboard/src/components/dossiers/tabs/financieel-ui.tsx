/**
 * Gedeelde opmaak voor het Financieel-tab en de blokken die eruit zijn losgetrokken: bedrag-
 * notatie en de tabelcellen. Eén plek, zodat de blokken niet uit elkaar gaan lopen.
 */

export const ROOD = '#d9534f'

export const toNum = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isNaN(n) ? 0 : n
}

export const fmt = (v: unknown, showZero = false): string => {
  const n = toNum(v)
  if (n === 0 && !showZero) return '—'
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)
}

/* ── gedeelde cel-componenten ────────────────────────────────────────── */

export const TH = ({ children, right, center, compact, groepKop, groepStart, rowSpan, colSpan }: {
  children?: React.ReactNode
  right?: boolean
  center?: boolean
  compact?: boolean
  groepKop?: boolean    // component-kop over 2 subkolommen — geen onderrand (loopt door naar de subkoppen)
  groepStart?: boolean  // eerste kolom van een groep — verticale scheidingslijn links
  rowSpan?: number
  colSpan?: number
}) => (
  <th rowSpan={rowSpan} colSpan={colSpan} style={{
    padding: compact ? '6px 6px' : '7px 12px',
    textAlign: center ? 'center' : right ? 'right' : 'left',
    fontSize: compact ? 10 : 11,
    fontWeight: 700,
    color: 'var(--neutral-500)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: groepKop ? 'none' : '2px solid var(--border)',
    borderLeft: groepStart ? '1px solid var(--neutral-200)' : undefined,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }}>
    {children}
  </th>
)

export const TD = ({ children, vet, accent, kleur, compact, groepStart }: {
  children: React.ReactNode
  vet?: boolean
  accent?: boolean
  kleur?: string
  compact?: boolean
  groepStart?: boolean  // eerste kolom van een groep — verticale scheidingslijn links
}) => (
  <td style={{
    padding: compact ? '5px 6px' : '6px 12px',
    fontSize: compact ? 11.5 : 13,
    textAlign: 'right',
    fontWeight: vet ? 700 : 400,
    color: kleur ?? (accent ? 'var(--accent)' : vet ? 'var(--neutral-900)' : 'var(--neutral-700)'),
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)',
    borderLeft: groepStart ? '1px solid var(--neutral-200)' : undefined,
    whiteSpace: 'nowrap',
  }}>
    {children}
  </td>
)
