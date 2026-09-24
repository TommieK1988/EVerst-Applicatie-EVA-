// Tijdrekenwerk voor de prikklok. Alles draait om de Nederlandse kalenderdag en klok: Vercel draait
// in UTC, dus nooit `getHours()` of `toISOString().slice(0, 10)` op een moment gebruiken.

const TZ = 'Europe/Amsterdam'

/** 'YYYY-MM-DD' van een moment, in Nederlandse tijd. */
export function amsterdamDatum(moment: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(moment))
}

/** 'HH:MM' van een moment, in Nederlandse tijd. */
export function amsterdamTijd(moment: Date | string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(moment))
}

/** Verschil tussen Nederlandse tijd en UTC op dit moment, in minuten (60 of 120). */
function offsetMinuten(moment: Date): number {
  const delen = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(moment)
  const w = (t: string) => Number(delen.find(d => d.type === t)?.value)
  const alsUtc = Date.UTC(w('year'), w('month') - 1, w('day'), w('hour'), w('minute'), w('second'))
  return Math.round((alsUtc - moment.getTime()) / 60_000)
}

/**
 * Het moment dat hoort bij een Nederlandse datum + klok ('2026-09-23', '16:45'). Twee rondes, zodat
 * een tijd vlak na de zomertijdwissel de juiste offset krijgt.
 */
export function amsterdamMoment(datum: string, tijd: string): Date {
  const [j, m, d] = datum.split('-').map(Number)
  const [u, mi] = tijd.split(':').map(Number)
  const naief = Date.UTC(j, m - 1, d, u, mi)
  let moment = new Date(naief - offsetMinuten(new Date(naief)) * 60_000)
  moment = new Date(naief - offsetMinuten(moment) * 60_000)
  return moment
}

/** Minuten tussen twee momenten, naar beneden afgerond. */
export function minutenTussen(van: string | Date, tot: string | Date): number {
  return Math.max(0, Math.floor((new Date(tot).getTime() - new Date(van).getTime()) / 60_000))
}
