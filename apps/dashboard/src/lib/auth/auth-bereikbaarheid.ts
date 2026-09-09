/**
 * Vangnet voor een onbereikbare auth-server.
 *
 * Élke paginarequest loopt door de middleware, en die wacht daar op
 * `supabase.auth.getUser()` — een netwerkcall naar de Supabase-auth-server.
 * Op 7 september 2026 gaf die server een paar minuten lang Cloudflare-522
 * ("connection timed out"). supabase-js probeert het dan uit zichzelf een
 * aantal keer opnieuw, en Vercel kapte elke request af na 25 seconden:
 * MIDDLEWARE_INVOCATION_TIMEOUT. Gevolg: heel EVA onbereikbaar, en voor de
 * gebruiker een kale Vercel-foutpagina zonder enige uitleg.
 *
 * De storing bij Supabase kunnen we niet voorkomen; 25 seconden blijven hangen
 * wél. We begrenzen de auth-call daarom twee keer:
 *
 *  1. per losse fetch (`AUTH_FETCH_TIMEOUT_MS`), zodat één hangende verbinding
 *     niet eindeloos blijft staan;
 *  2. over het geheel (`AUTH_DEADLINE_MS`), zodat ook de interne herpogingen
 *     van supabase-js binnen het budget van de edge-runtime blijven.
 *
 * Wordt de deadline gehaald, dan tonen we een eerlijke storingspagina die
 * zichzelf ververst. Bewust géén doorverwijzing naar /login: de sessie is niet
 * verlopen, de auth-server is alleen even weg — iedereen uitloggen maakt de
 * storing erger dan hij is, en na afloop staat half het bedrijf onnodig
 * opnieuw op het inlogscherm.
 */

import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/** Maximale duur van één losse fetch naar de auth-server. */
const AUTH_FETCH_TIMEOUT_MS = 8000

/**
 * Maximale duur van de hele auth-controle, herpogingen inbegrepen. Ruim onder
 * de 25 seconden die Vercel de middleware geeft, en ruim boven de ~150 ms die
 * een gezonde `getUser()` kost.
 *
 * Op 9 september 2026 bleek 4 s / 6 s te krap. De auth-server werd gedurende de
 * ochtend geleidelijk trager — p95 op `/auth/v1/user` liep op naar 2,5 s met
 * uitschieters tot 13,9 s — en 429 keer kreeg iemand de storingspagina terwijl
 * er niets stuk was: het antwoord kwam gewoon net te laat. De database stond er
 * die hele tijd stil bij, dus de traagheid zat in de auth-dienst zelf.
 *
 * Wachten is hier het minste kwaad: een pagina die drie tellen later verschijnt
 * is vervelend, een pagina die zegt dat EVA plat ligt houdt iemand tegen. De
 * grenzen blijven ver onder de 25 s van Vercel, zodat het vangnet nog steeds
 * eerder toeslaat dan de harde afkap.
 */
const AUTH_DEADLINE_MS = 12000

/**
 * Is dit "de server is onbereikbaar" of "het token deugt niet"? Alleen het
 * eerste is een storing; het tweede hoort gewoon naar het inlogscherm te leiden.
 *
 * De naamcontrole is dezelfde die `isAuthRetryableFetchError` uit supabase-js
 * doet. We doen hem hier zelf zodat de middleware niet afhangt van een export
 * die pas in een latere minor versie is toegevoegd.
 */
function isNetwerkstoring(fout: unknown): boolean {
  if (!fout || typeof fout !== 'object') return false
  const e = fout as { name?: string; status?: number }
  if (e.name === 'AuthRetryableFetchError') return true
  // 0 = verbinding brak af; 5xx = gateway/Cloudflare (502, 503, 504, 520-524, 530).
  return typeof e.status === 'number' && (e.status === 0 || e.status >= 500)
}

/**
 * `fetch` met een harde bovengrens per poging. supabase-js kent geen optie voor
 * een time-out per call, dus we geven de client zijn eigen fetch mee.
 */
export const begrensdeFetch: typeof fetch = (input, init) => {
  // Heeft de aanroeper zelf al een signaal meegegeven, dan dat respecteren:
  // dat overschrijven zou een bewuste annulering stilzwijgend kapotmaken.
  if (init?.signal) return fetch(input, init)
  return fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_FETCH_TIMEOUT_MS) })
}

export type AuthUitkomst =
  /** Auth-server antwoordde: ingelogd (`user`) of niet (`null`). */
  | { soort: 'ok'; user: User | null }
  /** Auth-server gaf binnen de deadline geen bruikbaar antwoord. */
  | { soort: 'onbereikbaar' }

/** `getUser()` met een deadline, zodat de middleware nooit blijft hangen. */
export async function haalGebruikerBegrensd(supabase: SupabaseClient): Promise<AuthUitkomst> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<AuthUitkomst>((resolve) => {
    timer = setTimeout(() => resolve({ soort: 'onbereikbaar' }), AUTH_DEADLINE_MS)
  })

  const call = supabase.auth
    .getUser()
    .then(({ data, error }): AuthUitkomst =>
      error && isNetwerkstoring(error)
        ? { soort: 'onbereikbaar' }
        : { soort: 'ok', user: data.user ?? null },
    )
    .catch((fout): AuthUitkomst =>
      // Een échte auth-fout (verlopen of ongeldig token) telt als "niet
      // ingelogd" — precies wat de middleware hiervoor ook deed.
      isNetwerkstoring(fout) ? { soort: 'onbereikbaar' } : { soort: 'ok', user: null },
    )

  try {
    return await Promise.race([call, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const STORINGSPAGINA = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>EVA is even niet bereikbaar</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #f8fafc; color: #0f172a; padding: 24px;
  }
  main { max-width: 30rem; text-align: center; }
  h1 { font-size: 1.35rem; margin: 0 0 .75rem; }
  p { margin: 0 0 .75rem; color: #475569; }
  .klein { font-size: .85rem; color: #94a3b8; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f172a; color: #f1f5f9; }
    p { color: #cbd5e1; }
    .klein { color: #64748b; }
  }
</style>
</head>
<body>
  <main>
    <h1>EVA is even niet bereikbaar</h1>
    <p>De inlogservice reageert op dit moment niet. Je bent <strong>niet</strong> uitgelogd — zodra de verbinding er weer is, ga je gewoon verder waar je was.</p>
    <p class="klein">Deze pagina probeert het vanzelf elke 10 seconden opnieuw.</p>
  </main>
</body>
</html>`

/**
 * Antwoord bij een onbereikbare auth-server: een korte, eerlijke storingspagina
 * in plaats van 25 seconden wachten op een Vercel-time-out.
 */
export function authOnbereikbaarResponse(isApiRoute: boolean): NextResponse {
  const headers = { 'Retry-After': '10', 'Cache-Control': 'no-store' }

  if (isApiRoute) {
    return NextResponse.json(
      { fout: 'auth_onbereikbaar', melding: 'De inlogservice is tijdelijk niet bereikbaar.' },
      { status: 503, headers },
    )
  }

  return new NextResponse(STORINGSPAGINA, {
    status: 503,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  })
}
