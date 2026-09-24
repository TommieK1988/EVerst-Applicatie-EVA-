// Nederlandse kloktijd op de server.
//
// Server actions draaien op Vercel in UTC. `new Date('2026-12-16T23:59:59')` is daar dus 23:59
// UTC = 00:59 NL (01:59 in de zomer), en `new Date('2026-12-16')` is 01:00/02:00 NL. Zo kwamen
// planitems midden in de nacht te staan. Alles wat een datum + kloktijd naar een moment omzet,
// hoort via deze helpers te gaan.

import type { MedewerkerRooster } from '@everts/database/platform-types'

const DAG_MS = 86_400_000

/** Offset ("+01:00" / "+02:00") van Europe/Amsterdam op een kalenderdag, zomertijd-bewust. */
function nlOffset(datum: string): string {
  const [y, m, d] = datum.split('-').map(Number)
  const naam = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(new Date(Date.UTC(y, m - 1, d, 12)))
    .find(p => p.type === 'timeZoneName')?.value // "GMT+02:00"
  const offset = naam?.replace('GMT', '')
  return offset && offset.length > 0 ? offset : '+01:00'
}

/** 'YYYY-MM-DD' + 'HH:MM[:SS]' in NL-kloktijd → ISO-moment met offset. */
export function nlTijdstip(datum: string, tijd: string): string {
  const t = tijd.length === 5 ? `${tijd}:00` : tijd.slice(0, 8)
  return `${datum}T${t}${nlOffset(datum)}`
}

/** Een moment ontleed in NL-datum en -kloktijd. */
export function nlDelen(ts: string): { datum: string; tijd: string } {
  const delen = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(ts))
  const g = (t: string) => delen.find(p => p.type === t)?.value ?? '00'
  const uur = g('hour') === '24' ? '00' : g('hour')
  return { datum: `${g('year')}-${g('month')}-${g('day')}`, tijd: `${uur}:${g('minute')}:${g('second')}` }
}

/** 'YYYY-MM-DD' + n kalenderdagen. */
export function plusDagen(datum: string, n: number): string {
  const [y, m, d] = datum.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * DAG_MS).toISOString().slice(0, 10)
}

/** Aantal kalenderdagen van `van` naar `tot` ('YYYY-MM-DD'). */
export function dagenTussen(van: string, tot: string): number {
  const ms = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((ms(tot) - ms(van)) / DAG_MS)
}

/** Verschuif een moment een aantal kalenderdagen met behoud van de NL-kloktijd (ook over DST heen). */
export function verschuifNlDagen(ts: string, n: number): string {
  const { datum, tijd } = nlDelen(ts)
  return nlTijdstip(plusDagen(datum, n), tijd)
}

const STANDAARD = { dagstart: '07:00:00', dageind: '16:00:00' }

/** Dagstart/-eind van een medewerker op `datum`; het laatst ingegane geldige rooster wint. */
export function roostertijdenOp(
  roosters: Pick<MedewerkerRooster, 'geldig_vanaf' | 'geldig_tot' | 'dagstart' | 'dageind'>[],
  datum: string,
): { dagstart: string; dageind: string } {
  const actief = roosters
    .filter(r => r.geldig_vanaf <= datum && (r.geldig_tot == null || r.geldig_tot >= datum))
    .sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf))[0]
  if (!actief?.dagstart || !actief?.dageind || actief.dageind <= actief.dagstart) return STANDAARD
  return { dagstart: actief.dagstart, dageind: actief.dageind }
}
