/**
 * mailintake/omschrijving.ts
 *
 * De projectomschrijving zoals die in Bouw7 terechtkomt.
 *
 * Bouw7 toont dit veld (`information`) als **Omschrijving** en rendert HTML. Het
 * zet Markdown níét om, en losse regeleinden zijn geen betrouwbare opmaak: wat er
 * met enters in gaat, komt er als één doorlopende lap uit. Daarom bouwt deze module
 * zelf een klein stukje HTML op.
 *
 * De omschrijving heeft altijd drie delen, ook als er één leeg is:
 *
 *   Scope            -- wat er gevraagd wordt
 *   Buiten scope     -- alleen wat er letterlijk is uitgesloten
 *   Aandachtspunten  -- voorwaarden en open punten uit de stukken
 *
 * Dat "alleen wat er letterlijk is uitgesloten" is geen stijlkwestie. Een verzonnen
 * uitsluiting om het kopje te vullen leest als een afspraak met de klant, en daar
 * wordt later op gecalculeerd. Staat er niets, dan staat er niets.
 *
 * Geen HTML uit de mail of de bijlagen overnemen. Klantmail zit vol opmaak,
 * tracking-pixels en losse tags; die horen niet in een projectveld. Alles wat hier
 * binnenkomt wordt daarom als platte tekst behandeld en ontsnapt.
 */

/** Zet de tekens veilig die anders de eigen opmaak zouden breken. */
export function ontsnapHtml(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Splitst een tekstvak in losse punten en haalt bestaande opsommingstekens weg. */
function puntenUit(tekst: string | null | undefined): string[] {
  return (tekst ?? '')
    .split('\n')
    .map(r => r.replace(/^\s*[-•*•]\s*/, '').trim())
    .filter(Boolean)
}

export interface OmschrijvingDelen {
  scope: string | null
  buitenScope: string | null
  aandachtspunten: string | null
}

/**
 * Bouwt de omschrijving op. Levert een lege string als er helemaal niets is -- dan
 * hoort er ook geen leeg kopje in Bouw7 te staan.
 */
export function bouwOmschrijvingHtml(delen: OmschrijvingDelen): string {
  const blok = (kop: string, punten: string[]): string | null => {
    if (!punten.length) return null
    const regels = punten.map(p => `• ${ontsnapHtml(p)}`).join('<br>\n')
    return `<p><strong>${kop}</strong><br>\n${regels}</p>`
  }

  return [
    blok('Scope', puntenUit(delen.scope)),
    blok('Buiten scope', puntenUit(delen.buitenScope)),
    blok('Aandachtspunten', puntenUit(delen.aandachtspunten)),
  ].filter(Boolean).join('\n\n')
}

/**
 * De projectnaam zoals de aanvraagmodal hem samenstelt:
 * "{Straat huisnr}, {Stad} - {Omschrijving}".
 *
 * Staat hier en niet in `aanmaken.ts` omdat het een pure functie is die ook door
 * de proef gebruikt wordt. Vanuit `aanmaken.ts` sleepte de proef anders de hele
 * meldingen- en SharePoint-keten mee, terwijl hij niets anders doet dan lezen.
 */
export function bouwTitel(v: {
  werkadresStraat?: string | null
  werkadresHuisnummer?: string | null
  werkadresStad?: string | null
  omschrijving?: string | null
}): string {
  const adres = [v.werkadresStraat, v.werkadresHuisnummer].filter(Boolean).join(' ').trim()
  const kop = [adres, v.werkadresStad].filter(Boolean).join(', ')
  const omschrijving = (v.omschrijving ?? '').trim()
  if (kop && omschrijving) return `${kop} - ${omschrijving}`
  return omschrijving || kop || 'Aanvraag uit e-mail'
}
