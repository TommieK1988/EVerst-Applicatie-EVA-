/**
 * De basis-URL van EVA, voor links in e-mail, QR-codes en portaallinks.
 *
 * Eén gedeelde bron, want dit is drie keer los overgeschreven en dan gaat er
 * ooit precies één kopie mee met een verhuizing. Bewust géén 'server-only':
 * de waarden komen uit NEXT_PUBLIC_-variabelen en de sanering is puur tekst.
 */

/**
 * Saneert een basis-URL uit een omgevingsvariabele. Vangt de veelgemaakte
 * misconfig waarbij de héle dotenv-regel als waarde is geplakt
 * (`NEXT_PUBLIC_APP_URL=https://…`) — dan zou elke link met
 * `NEXT_PUBLIC_APP_URL=` beginnen en dus onklikbaar zijn. Strippen we hier
 * altijd weg, samen met omringende quotes/spaties en een trailing slash.
 */
export function schoonBasisUrl(waarde: string): string {
  return waarde
    .trim()
    .replace(/^['"]|['"]$/g, '')          // omringende quotes
    .replace(/^[A-Z0-9_]+\s*=\s*/i, '')   // per ongeluk meegeplakte "KEY=" (bv. NEXT_PUBLIC_APP_URL=)
    .trim()
    .replace(/\/+$/, '')                  // trailing slash(es)
}

export function appBaseUrl(): string {
  const ruw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  return schoonBasisUrl(ruw)
}
