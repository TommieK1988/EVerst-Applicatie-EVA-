/**
 * Gedeelde regels voor het automatisch uitloggen.
 *
 * EVA logde eerder uit na 15 minuten zonder input. Voor de buitendienst werkte
 * dat averechts: wie een uur houtrot staat te herstellen en daarna een werkbon
 * wil invullen, stond telkens opnieuw op het inlogscherm. In plaats daarvan
 * loopt een sessie nu tot één vast moment per dag — daarna log je 's ochtends
 * gewoon opnieuw in.
 *
 * Zowel de client-timer (`components/eva/SessieVerloop.tsx`) als de server-side
 * handhaving (`middleware.ts`) gebruiken deze helpers, zodat ze niet uit elkaar
 * kunnen lopen.
 */

import {
  MOBIEL_SESSIE_MAXAGE, PORTAAL_MARKER_COOKIE, PORTAAL_SESSIE_MAXAGE,
} from '@everts/database/cookies'

/** Klokuur (lokale tijd) waarop elke sessie vervalt — eind van de werkdag. */
export const UITLOG_UUR = 18

/** Kantoortijdzone; de server draait op Vercel in UTC, dus expliciet zetten. */
export const TIJDZONE = 'Europe/Amsterdam'

/**
 * Cookie met het tijdstip (ms sinds epoch) waarop de sessie vervalt. Wordt bij
 * de eerste request van een sessie gezet en daarna alleen nog gelézen — hij
 * schuift dus niet op door verder gebruik. Bewust een sessie-cookie (geen
 * Max-Age): hij leeft en sterft samen met de Supabase-sessiecookies.
 */
export const COOKIE_SESSIE_VERLOOPT = 'eva_sessie_verloopt'

/** localStorage-sleutel zodat alle tabs op hetzelfde moment uitloggen. */
export const STORAGE_SESSIE_VERLOOPT = 'eva-sessie-verloopt'

/**
 * Het eerstvolgende moment waarop het {@link UITLOG_UUR} slaat, in ms sinds
 * epoch. Werkt op de server (UTC) en in de browser identiek doordat het huidige
 * klokuur via {@link TIJDZONE} wordt uitgelezen in plaats van via `getHours()`.
 *
 * Tweemaal per jaar valt er een zomertijdovergang tussen nu en het uitlogmoment;
 * de sessie loopt dan een uur korter of langer. Dat is voor dit doel prima.
 */
export function volgendeUitlogTijd(nu: Date = new Date()): number {
  const delen = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIJDZONE, hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(nu)

  const deel = (type: string) => Number(delen.find(d => d.type === type)?.value ?? 0)
  // 'en-GB' geeft middernacht als 24; naar 0 normaliseren.
  const secondenNu = (deel('hour') % 24) * 3600 + deel('minute') * 60 + deel('second')
  const doel = UITLOG_UUR * 3600
  const overSeconden = doel > secondenNu ? doel - secondenNu : doel - secondenNu + 86_400

  return nu.getTime() + overSeconden * 1000
}

/**
 * Vervalmoment voor een mobiele sessie: absoluut 3 dagen na login (ms sinds
 * epoch). Anders dan {@link volgendeUitlogTijd} niet gekoppeld aan een klokuur,
 * maar aan het inlogmoment — de mobiele gebruiker logt zo hooguit 1× per 3 dagen
 * opnieuw in. Wordt bij de eerste request van de sessie gezet en daarna alleen
 * gelézen, zodat verder gebruik het moment niet vooruitschuift.
 */
export function mobieleVervalTijd(nu: Date = new Date()): number {
  return nu.getTime() + MOBIEL_SESSIE_MAXAGE * 1000
}

/**
 * Markercookie: deze browser gebruikt het klantportaal.
 *
 * Puur voor routering en cookielevensduur — hij bepaalt waar iemand na het
 * inloggen heen gaat, meer niet. Wie hem zelf zet, komt hooguit op /portaal uit
 * en wordt daar door `vereisPortaalPagina` alsnog weggestuurd. Nooit als gate
 * gebruiken.
 */
export const COOKIE_PORTAAL = PORTAAL_MARKER_COOKIE

export { PORTAAL_SESSIE_MAXAGE }

/**
 * Vervalmoment voor een portaalsessie: absoluut 14 dagen na login. Bewust niet
 * gekoppeld aan het uitlogmoment van EVA — een opdrachtgever heeft geen
 * werkdag die om 18:00 eindigt.
 */
export function portaalVervalTijd(nu: Date = new Date()): number {
  return nu.getTime() + PORTAAL_SESSIE_MAXAGE * 1000
}
