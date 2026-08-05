/**
 * bestelling-mail.ts
 *
 * Bouwt de HTML-body van de mail waarmee een inkooporder of onderaannemersopdracht naar de
 * leverancier gaat.
 *
 * Waarom een eigen bouwer en niet gewoon de tekst in een <div> met `white-space:pre-wrap`:
 * Outlook rendert HTML met de Word-engine en negeert `white-space`. Alle regeleinden vielen
 * daardoor weg en de hele mail werd één doorlopende zin. Regeleinden moeten dus als echte
 * `<p>`/`<br>` in de HTML staan.
 *
 * Zelfde reden voor de rest van de opmaak: tabellen in plaats van flex/grid, inline styles in
 * plaats van een <style>-blok, en een vaste breedte in plaats van `max-width`. Dat is wat de
 * Word-engine begrijpt.
 */

export type BestellingMailData = {
  soort: 'inkooporder' | 'oa_contract'
  /** Vrije berichttekst uit het verzendvenster (platte tekst met regeleinden). */
  bericht: string
  /** Bouw7-order-/contractnummer, bv. "20267.00576OA001". */
  nummer?: string | null
  project?: string | null
  werkadres?: string | null
  /** Leverdatum (inkooporder) of startdatum (onderaannemersopdracht), al als dd-mm-jjjj. */
  leverdatum?: string | null
  betaalafspraak?: string | null
  /** Totaalbedrag excl. btw. */
  totaal?: number | null
}

const GROEN = '#009439'
const TEKST = '#1f2933'
const GRIJS = '#5a6472'
const LIJN = '#e2e6ea'
const VLAK = '#f4f7f5'
const FONT = "'Segoe UI',Segoe,Arial,Helvetica,sans-serif"

const euro = (n: number) =>
  '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Platte tekst → alinea's. Lege regel = nieuwe alinea. */
function alineas(tekst: string): string[] {
  return (tekst ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(blok => blok.trim())
    .filter(Boolean)
}

/** Eén alinea als HTML; een enkele regelovergang binnen de alinea wordt een <br>. */
function alineaHtml(blok: string): string {
  return `<p style="margin:0 0 14px 0">${esc(blok).replace(/\n/g, '<br>')}</p>`
}

const GROET = /^(met\s+(vriendelijke|hartelijke)\s+groet|vriendelijke\s+groet|hartelijke\s+groet|groeten)/i

/** Eén regel in het gegevensblok; lege waarden vallen weg. */
function rij(label: string, waarde?: string | null): string {
  if (!waarde) return ''
  return (
    `<tr>` +
    `<td style="padding:5px 16px 5px 18px;font-size:12px;color:${GRIJS};white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
    `<td style="padding:5px 18px 5px 0;font-size:13px;color:${TEKST};font-weight:600;vertical-align:top">${esc(waarde)}</td>` +
    `</tr>`
  )
}

/**
 * Bouwt de complete mailbody: de berichttekst als alinea's, daaronder een compact gegevensblok
 * met de kern van de order — zodat de leverancier het nummer, het project en het bedrag ziet
 * zonder de PDF te openen. De ondertekening komt uit de berichttekst; de naam en functie van de
 * afzender worden door de handtekening van Outlook toegevoegd.
 */
export function bouwBestellingMailHtml(data: BestellingMailData): string {
  const isOa = data.soort === 'oa_contract'

  const gegevens =
    rij(isOa ? 'Opdrachtnummer' : 'Ordernummer', data.nummer) +
    rij('Project', data.project) +
    rij('Werkadres', data.werkadres) +
    rij(isOa ? 'Startdatum' : 'Gewenste levering', data.leverdatum) +
    rij('Bedrag', data.totaal != null ? `${euro(data.totaal)} excl. btw` : null) +
    rij('Betaalafspraak', data.betaalafspraak)

  const blok = gegevens
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
      `style="border-collapse:collapse;background:${VLAK};border:1px solid ${LIJN};border-left:3px solid ${GROEN};margin:0 0 18px 0">` +
      `<tbody>${gegevens}</tbody></table>`
    : ''

  // Het blok hoort bij het bericht, dus vlak vóór de afsluitende groet — of onderaan als de
  // gebruiker de groet uit de tekst heeft gehaald.
  const stukken = alineas(data.bericht)
  const groet = stukken.findIndex(a => GROET.test(a))
  const knip = groet === -1 ? stukken.length : groet
  const inhoud = [
    ...stukken.slice(0, knip).map(alineaHtml),
    blok,
    ...stukken.slice(knip).map(alineaHtml),
  ].join('')

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">` +
    `<tr><td style="padding:0">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" ` +
    `style="border-collapse:collapse;width:620px;font-family:${FONT};font-size:14px;line-height:1.55;color:${TEKST}">` +
    `<tr><td style="padding:0">` +
    inhoud +
    `</td></tr></table>` +
    `</td></tr></table>`
  )
}
