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

/**
 * Het omgekeerde: platte tekst naar de rich-text-vorm die Bouw7 zelf schrijft.
 *
 * Gemeten op 600 facturen: de Bouw7-editor maakt van elke regel (Enter) een eigen `<p>`, en van een
 * lege regel `<p>&nbsp;</p>`. Door precies die vorm aan te leveren ziet een factuurtekst uit EVA er
 * in Bouw7 hetzelfde uit als een die de administratie daar zelf typt — en blijft hij daar gewoon
 * bewerkbaar. Lege regels aan het begin en eind vallen weg; lege invoer geeft `''`.
 */
export function tekstNaarBouw7RichText(tekst: string | null | undefined): string {
  if (!tekst) return ''
  const regels = tekst.replace(/\r\n?/g, '\n').split('\n').map(r => r.trimEnd())
  while (regels.length > 0 && regels[0].trim() === '') regels.shift()
  while (regels.length > 0 && regels[regels.length - 1].trim() === '') regels.pop()
  return regels
    .map(r => r.trim() === ''
      ? '<p>&nbsp;</p>'
      : `<p>${r
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')}</p>`)
    .join('')
}
