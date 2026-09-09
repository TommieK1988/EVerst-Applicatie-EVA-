/**
 * Hulpjes voor mailteksten die uit een sjabloon komen.
 *
 * Deze stonden in `app/(platform)/everts-calc/actions/bestellingen.ts`, maar dat is een
 * `'use server'`-module: daar mag elke export alleen een async functie zijn, dus ze waren niet te
 * delen. Nu de uitvraagmail dezelfde plaatshouders en dezelfde opschoning nodig heeft, staan ze hier
 * — één plek, in plaats van een tweede en derde kopie die stilletjes uit elkaar gaan lopen.
 */

/**
 * Vult {sleutel}-plaatshouders. Onbekende sleutels worden leeggemaakt, zodat er nooit
 * een letterlijke accolade-tekst bij de leverancier belandt.
 */
export function vulMailTekst(tekst: string, vars: Record<string, string>): string {
  return (tekst ?? '').replace(/\{([a-z0-9_.]+)\}/gi, (_, sleutel: string) => vars[sleutel] ?? '')
}

/**
 * Een leeggebleven variabele laat zijn scheidingsteken achter: "Inkooporder 123 — ".
 * Voor het onderwerp (één regel) halen we die rommel weg.
 */
export function netteRegel(tekst: string): string {
  return tekst
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*[—–|-]\s*$/, '')
    .replace(/^\s*[—–|-]\s*/, '')
    .trim()
}

/**
 * De mailtekst van een sjabloon is platte tekst met regeleinden; de HTML-bouwers maken er
 * Outlook-proof HTML van. Oudere sjablonen kunnen er HTML in hebben staan; die wordt hier
 * teruggebracht tot tekst zodat de alinea-indeling blijft kloppen.
 */
export function naarPlatteTekst(ruw: string): string {
  return (ruw ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
