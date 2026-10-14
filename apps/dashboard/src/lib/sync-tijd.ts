/**
 * "Sync: Vandaag 14:32" / "Gisteren…" / "Eergisteren…" / "28-06-2026 08:00".
 */
const TZ = 'Europe/Amsterdam'
/** Kalenderdag in Nederlandse tijd als dagnummer, voor het verschil "vandaag/gisteren". */
const nlDag = (d: Date) => Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)) / 86_400_000

/**
 * Altijd in Nederlandse tijd: het label wordt ook op de server (UTC) gerenderd, bv. in de
 * Goedkeuren-widget. Zonder vaste tijdzone zei de server "11:13" en de browser "13:13" —
 * een hydration-fout (React #418) op de startpagina.
 */
export function syncTijdLabel(iso: string | null): string {
  if (!iso) return 'Nooit'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'Nooit'
  const dagen = Math.round(nlDag(new Date()) - nlDag(d))
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
  if (dagen <= 0) return `Vandaag ${tijd}`
  if (dagen === 1) return `Gisteren ${tijd}`
  if (dagen === 2) return `Eergisteren ${tijd}`
  return `${d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ })} ${tijd}`
}
