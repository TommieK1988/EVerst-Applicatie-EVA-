/**
 * Een spoor achterlaten in de cron-logs.
 *
 * Aanleiding: op 7 september 2026 liepen alle cron-taken een halve dag in hun
 * time-out. Het enige dat in de Vercel-logs stond was:
 *
 *     Vercel Runtime Timeout Error: Task timed out after 60 seconds
 *
 * Verder niets. Geen begin, geen stap, geen dienstnaam — de functie werd
 * doodgeschoten terwijl hij ergens op wachtte, en achteraf was uit de logs niet
 * op te maken wáár. De diagnose kostte daardoor meer tijd dan de reparatie.
 *
 * Dat is precies het gat dat dit dicht. Belangrijk om te begrijpen: als het
 * platform de functie afkapt, draait er géén `finally` en komt er dus nooit een
 * "klaar"-regel. Dat is geen tekortkoming maar het signaal — je ziet dan de
 * start plus de laatst gehaalde stap, en dáár is hij blijven hangen.
 *
 * Vandaar de regel bij het plaatsen van `stap()`: zet er een vóór elke aanroep
 * naar buiten (Bouw7, Microsoft, mail). Een stap die je niet terugziet, is de
 * stap die hing.
 *
 * Bewust `console` en niet het foutenlog uit lib/fouten: dat schrijft naar de
 * database, en juist als het misgaat is dat de weg die mogelijk niet werkt.
 */

export interface CronLogboek {
  /** Markeer een fase. Zet er één vóór elke aanroep naar een externe dienst. */
  stap(label: string, extra?: Record<string, unknown>): void
  /** Nette afsluiting; logt de totale duur. */
  klaar(extra?: Record<string, unknown>): number
  /** Afsluiting na een fout. */
  mislukt(fout: unknown): number
  /** Milliseconden sinds de start. */
  duurMs(): number
}

function beknopt(extra?: Record<string, unknown>): string {
  if (!extra || Object.keys(extra).length === 0) return ''
  try {
    return ' ' + JSON.stringify(extra)
  } catch {
    return ''
  }
}

/**
 * Begin een cron-run. Logt meteen een startregel, zodat er ook iets in de log
 * staat als de run nooit afmaakt.
 */
export function cronLogboek(naam: string): CronLogboek {
  const start = Date.now()
  const duurMs = () => Date.now() - start

  console.log(`[cron ${naam}] start`)

  return {
    duurMs,
    stap(label, extra) {
      console.log(`[cron ${naam}] ${label} +${duurMs()}ms${beknopt(extra)}`)
    },
    klaar(extra) {
      const ms = duurMs()
      console.log(`[cron ${naam}] klaar in ${ms}ms${beknopt(extra)}`)
      return ms
    },
    mislukt(fout) {
      const ms = duurMs()
      const melding = fout instanceof Error ? `${fout.name}: ${fout.message}` : String(fout)
      console.error(`[cron ${naam}] MISLUKT na ${ms}ms — ${melding}`)
      return ms
    },
  }
}
