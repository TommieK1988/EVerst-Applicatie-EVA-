import type { BedrijfsagendaVirtueel } from '@everts/database/platform-types'

function berekenPaaszondag(jaar: number): Date {
  const a = jaar % 19
  const b = Math.floor(jaar / 100)
  const c = jaar % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const maand = Math.floor((h + l - 7 * m + 114) / 31)
  const dag   = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(jaar, maand - 1, dag)
}

function datumStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function addDagen(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function berekenFeestdagen(jaar: number): BedrijfsagendaVirtueel[] {
  const kleur = '#dc2626'
  const pasen = berekenPaaszondag(jaar)

  const vaste: { datum: string; naam: string }[] = [
    { datum: `${jaar}-01-01`, naam: 'Nieuwjaarsdag' },
    { datum: `${jaar}-04-27`, naam: 'Koningsdag' },
    ...(jaar % 5 === 0 ? [{ datum: `${jaar}-05-05`, naam: 'Bevrijdingsdag' }] : []),
    { datum: `${jaar}-12-25`, naam: 'Eerste Kerstdag' },
    { datum: `${jaar}-12-26`, naam: 'Tweede Kerstdag' },
  ]

  const variabel: { datum: Date; naam: string }[] = [
    { datum: pasen,               naam: 'Eerste Paasdag' },
    { datum: addDagen(pasen, 1),  naam: 'Tweede Paasdag' },
    { datum: addDagen(pasen, 39), naam: 'Hemelvaartsdag' },
    { datum: addDagen(pasen, 49), naam: 'Eerste Pinksterdag' },
    { datum: addDagen(pasen, 50), naam: 'Tweede Pinksterdag' },
  ]

  return [
    ...vaste.map(({ datum, naam }) => ({
      id:          `feestdag-${naam.toLowerCase().replace(/\s+/g, '-')}-${jaar}`,
      type:        'feestdag' as const,
      titel:       naam,
      start_datum: datum,
      eind_datum:  datum,
      hele_dag:    true  as const,
      in_planning: false as const,
      kleur,
    })),
    ...variabel.map(({ datum, naam }) => ({
      id:          `feestdag-${naam.toLowerCase().replace(/\s+/g, '-')}-${jaar}`,
      type:        'feestdag' as const,
      titel:       naam,
      start_datum: datumStr(datum),
      eind_datum:  datumStr(datum),
      hele_dag:    true  as const,
      in_planning: false as const,
      kleur,
    })),
  ].sort((a, b) => a.start_datum.localeCompare(b.start_datum))
}
