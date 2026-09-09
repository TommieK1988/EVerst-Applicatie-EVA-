/**
 * uitvraag-mail.ts
 *
 * Bouwt de HTML-body van de mail waarmee we bij een onderaannemer of leverancier een prijs
 * opvragen, en van de rappel die daarna volgt.
 *
 * Waarom een eigen bouwer en niet gewoon de tekst in een <div> met `white-space:pre-wrap`:
 * Outlook rendert HTML met de Word-engine en negeert `white-space`. Alle regeleinden vielen
 * daardoor weg en de hele mail werd één doorlopende zin. Regeleinden moeten dus als echte
 * `<p>`/`<br>` in de HTML staan. Zelfde reden voor de rest: tabellen in plaats van flex/grid,
 * inline styles in plaats van een <style>-blok, vaste breedte in plaats van `max-width`.
 * Dit is dezelfde aanpak (en dezelfde huisstijl) als `lib/bouw7/bestelling-mail.ts`.
 *
 * WAT ER BEWUST NIET IN DE MAIL STAAT: interne opmerkingen, de status van de uitvraag, en vooral
 * niet welke ándere partijen zijn uitgevraagd. Een onderaannemer die leest dat hetzelfde werk bij
 * drie concurrenten ligt, is een onderhandelingsprobleem.
 */

export type UitvraagMailRegel = {
  /** "20267.00421 — Weena 1-115, renovatie trappenhuizen" */
  project: string
  discipline: string
  /** Al opgemaakt als dd-mm-jjjj, of leeg. */
  aangevraagdOp?: string | null
  reactieUiterlijk?: string | null
}

export type UitvraagMailData = {
  soort: 'uitvraag' | 'rappel'
  /** Vrije berichttekst uit het verzendvenster (platte tekst met regeleinden). */
  bericht: string
  /** Werk waarover het gaat. Bij een rappel zijn dit alle openstaande regels van die partij. */
  regels: UitvraagMailRegel[]
  /** Alleen bij een enkele uitvraag: het werkadres van het project. */
  werkadres?: string | null
}

const GROEN = '#009439'
const TEKST = '#1f2933'
const GRIJS = '#5a6472'
const LIJN  = '#e2e6ea'
const VLAK  = '#f4f7f5'
const FONT  = "'Segoe UI',Segoe,Arial,Helvetica,sans-serif"

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

const th = (t: string, breed?: boolean) =>
  `<th style="padding:7px 12px;font-size:11px;font-weight:700;color:#fff;background:${GROEN};` +
  `text-align:left;white-space:nowrap${breed ? ';width:52%' : ''}">${esc(t)}</th>`

const td = (t: string, vet?: boolean) =>
  `<td style="padding:7px 12px;font-size:12.5px;color:${TEKST};border-bottom:1px solid ${LIJN};` +
  `vertical-align:top${vet ? ';font-weight:600' : ''}">${esc(t || '—')}</td>`

/**
 * De werktabel. Bij één regel (een gewone uitvraag) tonen we geen kolom "aangevraagd op" — dat is
 * de mail zelf. Bij een rappel juist wél: dat de aanvraag van drie weken geleden is, is precies
 * het punt dat we willen maken zonder het met zoveel woorden te hoeven zeggen.
 */
function tabel(data: UitvraagMailData): string {
  if (data.regels.length === 0) return ''
  const isRappel = data.soort === 'rappel'

  const kop =
    `<tr>${th('Project', true)}${th('Onderdeel')}` +
    (isRappel ? th('Aangevraagd') : '') +
    th('Reactie uiterlijk') +
    `</tr>`

  const rijen = data.regels.map(r =>
    `<tr>${td(r.project, true)}${td(r.discipline)}` +
    (isRappel ? td(r.aangevraagdOp ?? '') : '') +
    td(r.reactieUiterlijk ?? '') +
    `</tr>`,
  ).join('')

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;border:1px solid ${LIJN};margin:0 0 18px 0">` +
    `<thead>${kop}</thead><tbody>${rijen}</tbody></table>`
  )
}

/** Losse regel onder de tabel, bv. het werkadres bij een enkele uitvraag. */
function werkadresBlok(werkadres?: string | null): string {
  if (!werkadres) return ''
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;background:${VLAK};border:1px solid ${LIJN};` +
    `border-left:3px solid ${GROEN};margin:0 0 18px 0"><tbody><tr>` +
    `<td style="padding:6px 16px 6px 18px;font-size:12px;color:${GRIJS};white-space:nowrap">Werkadres</td>` +
    `<td style="padding:6px 18px 6px 0;font-size:13px;color:${TEKST};font-weight:600">${esc(werkadres)}</td>` +
    `</tr></tbody></table>`
  )
}

/**
 * Bouwt de complete mailbody: de berichttekst als alinea's, met daarin — vlak vóór de afsluitende
 * groet — de tabel met het werk waar het over gaat. De ondertekening komt uit de berichttekst; de
 * naam en functie van de afzender voegt Outlook zelf toe via de handtekening.
 */
export function bouwUitvraagMailHtml(data: UitvraagMailData): string {
  const blok = tabel(data) + werkadresBlok(data.werkadres)

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
