/**
 * Bouw7 rich-text omzetten naar platte tekst.
 *
 * Staat bewust in een eigen module en niet in `sync.ts`: dat bestand is een `'use server'`-module
 * en daar moet elke export een async functie zijn — een synchrone helper exporteren laat de
 * Next-build vallen ("Server Actions must be async functions"). `tsc` ziet die regel niet.
 */

/**
 * Zet Bouw7 rich-text (de `note`/`information`-velden komen als HTML binnen) om naar
 * leesbare platte tekst. De notitie-weergave rendert bewust géén HTML (geen
 * dangerouslySetInnerHTML → geen XSS), dus de opmaak moet hier al platgeslagen zijn.
 * Behoudt de structuur: paragrafen en <br> worden regeleindes, lijst-items krijgen
 * een bullet. Platte tekst zonder tags passeert vrijwel ongewijzigd.
 */
export function bouw7RichTextNaarTekst(html: string): string {
  if (!html) return ''
  let s = html
    .replace(/\r\n?/g, '\n')
    // lijst-items → bullet op eigen regel
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    // regel- en paragraaf-scheiders
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr)>/gi, '\n')
    // resterende tags weg
    .replace(/<[^>]+>/g, '')
  // veelvoorkomende HTML-entities decoderen
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
  // whitespace opschonen: spaties per regel trimmen, max één lege regel
  return s
    .split('\n')
    .map(r => r.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
