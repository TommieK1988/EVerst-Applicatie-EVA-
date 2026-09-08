/**
 * Elke uitgaande call krijgt een bovengrens.
 *
 * Aanleiding: op 7 september 2026 lagen alle cron-taken er een halve dag uit —
 * `portaal-mail` zestien uur achter elkaar, en ook de nachtelijke Bouw7-sync,
 * `uren`, `toolbox-momenten` en `fouten-opruimen`. In de logs stond telkens
 * alleen `Vercel Runtime Timeout Error: Task timed out after 60 seconds`. Geen
 * stacktrace, geen dienstnaam, niets: de functie werd doodgeschoten terwijl hij
 * op iets stond te wachten, en achteraf was uit niets af te leiden waarop.
 *
 * Dat kon omdat geen enkele `fetch()` in EVA een time-out had. Blijft Bouw7,
 * Microsoft of een bestandsserver hangen, dan wacht de aanroeper het volledige
 * functiebudget uit (60 s voor de meeste routes, 300 s voor de zware) en gaat
 * daarna dood zonder ooit een fout te hebben gegooid. Dezelfde oorzaak legde die
 * dag ook de middleware plat; zie lib/auth/auth-bereikbaarheid.ts.
 *
 * Twee dingen winnen we hier:
 *
 *  1. **Falen kost seconden in plaats van minuten.** De aanroeper krijgt een
 *     echte fout die hij kan afhandelen, in plaats van te worden afgekapt.
 *  2. **De fout noemt de dienst.** `Bouw7 antwoordde niet binnen 30 s` belandt
 *     via de onRequestError-hook in het foutenlog en wijst meteen de schuldige
 *     aan — precies wat er die dag ontbrak.
 *
 * Kies de grens naar wat de dienst rédelijkerwijs nodig heeft, niet naar wat het
 * functiebudget toelaat: een grens gelijk aan het budget is geen grens.
 */

/** Ruime standaard voor een gewone API-call. */
export const STANDAARD_TIMEOUT_MS = 30_000

export class DienstTimeoutError extends Error {
  constructor(
    public readonly dienst: string,
    public readonly timeoutMs: number,
  ) {
    super(`${dienst} antwoordde niet binnen ${Math.round(timeoutMs / 1000)} s`)
    this.name = 'DienstTimeoutError'
  }
}

/** Is dit een afgekapte call (van ons of van de aanroeper)? */
export function isTimeoutFout(fout: unknown): boolean {
  if (fout instanceof DienstTimeoutError) return true
  return fout instanceof Error && (fout.name === 'TimeoutError' || fout.name === 'AbortError')
}

/**
 * `fetch` met een harde bovengrens. Bij overschrijding een `DienstTimeoutError`
 * die de dienst bij naam noemt, in plaats van een kale `AbortError`.
 *
 * Geeft de aanroeper zelf een `signal` mee, dan blijft die leidend — die heeft
 * dan een eigen reden om te annuleren en die mogen we niet overschrijven.
 */
export async function fetchMetDeadline(
  input: string | URL | Request,
  init: RequestInit,
  { dienst, timeoutMs = STANDAARD_TIMEOUT_MS }: { dienst: string; timeoutMs?: number },
): Promise<Response> {
  if (init.signal) return fetch(input, init)

  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (fout) {
    if (fout instanceof Error && (fout.name === 'TimeoutError' || fout.name === 'AbortError')) {
      throw new DienstTimeoutError(dienst, timeoutMs)
    }
    throw fout
  }
}

/** Kortere vorm voor het veelvoorkomende geval "haal dit bestand op". */
export function haalOp(
  url: string | URL,
  opties: { dienst: string; timeoutMs?: number; init?: RequestInit },
): Promise<Response> {
  return fetchMetDeadline(url, opties.init ?? {}, {
    dienst: opties.dienst,
    timeoutMs: opties.timeoutMs,
  })
}
