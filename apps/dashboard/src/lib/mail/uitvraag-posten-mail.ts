/**
 * uitvraag-posten-mail.ts
 *
 * Het stuk van de uitvraagmail dat alleen bij een uitvraag vanuit de calculatie (een pakket)
 * verschijnt: de posten waarvoor we een prijs vragen, plus het projectbezoek en de reactiedatum.
 * `bouwUitvraagMailHtml` zet dit onder de werktabel (`extraHtml`).
 *
 * BEWUST GEEN PRIJZEN: de onderaannemer krijgt omschrijving, hoeveelheid en eenheid — nooit onze
 * eigen calculatieprijs. Die zou zijn offerte sturen in plaats van andersom.
 *
 * Zelfde Outlook-regels als `uitvraag-mail.ts`: tabellen, inline styles, geen flex/grid.
 */

import { MAIL_KLEUR } from './uitvraag-mail'
import { nlDelen } from '@/lib/planning/nl-tijd'

const { GROEN, TEKST, GRIJS, LIJN, VLAK } = MAIL_KLEUR

export type UitvraagPostenMailData = {
  posten: { omschrijving: string; hoeveelheid: number | null; eenheid: string | null }[]
  /** ISO-tijdstip, of leeg. */
  projectbezoekOp?: string | null
  /** yyyy-mm-dd, of leeg. */
  reactieUiterlijk?: string | null
}

/** Escapen voor tekst én attributen: omschrijvingen komen uit de calculatie en zijn vrije tekst. */
export function escHtml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const GETAL = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 })

/** 12,5 — of leeg als er geen hoeveelheid is. */
export function formatHoeveelheid(h: number | null | undefined): string {
  return typeof h === 'number' && Number.isFinite(h) ? GETAL.format(h) : ''
}

/** "21-10-2026, 09:30" in Nederlandse tijd; leeg bij een ongeldige of lege waarde. */
export function formatProjectbezoek(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return ''
  const { datum, tijd } = nlDelen(iso)
  const [j, m, d] = datum.split('-')
  return `${d}-${m}-${j}, ${tijd.slice(0, 5)}`
}

/** dd-mm-jjjj uit yyyy-mm-dd. */
function nlDatum(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso
}

const th = (t: string, rechts?: boolean) =>
  `<th style="padding:7px 12px;font-size:11px;font-weight:700;color:#fff;background:${GROEN};` +
  `text-align:${rechts ? 'right' : 'left'};white-space:nowrap">${escHtml(t)}</th>`

const td = (t: string, rechts?: boolean) =>
  `<td style="padding:7px 12px;font-size:12.5px;color:${TEKST};border-bottom:1px solid ${LIJN};` +
  `vertical-align:top${rechts ? ';text-align:right;white-space:nowrap' : ''}">${escHtml(t || '—')}</td>`

/** De postentabel: Omschrijving | Hoeveelheid | Eenheid. Leeg zonder posten. */
export function bouwPostenTabelHtml(posten: UitvraagPostenMailData['posten']): string {
  if (posten.length === 0) return ''
  const rijen = posten.map(p =>
    `<tr>${td(p.omschrijving)}${td(formatHoeveelheid(p.hoeveelheid), true)}${td(p.eenheid ?? '')}</tr>`,
  ).join('')
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;border:1px solid ${LIJN};margin:0 0 18px 0">` +
    `<thead><tr>${th('Omschrijving')}${th('Hoeveelheid', true)}${th('Eenheid')}</tr></thead>` +
    `<tbody>${rijen}</tbody></table>`
  )
}

/** Losse gegevensregels (projectbezoek, reactiedatum) in hetzelfde kader als het werkadres. */
function infoBlok(regels: [string, string][]): string {
  const gevuld = regels.filter(([, w]) => w)
  if (gevuld.length === 0) return ''
  const rijen = gevuld.map(([label, waarde]) =>
    `<tr><td style="padding:6px 16px 6px 18px;font-size:12px;color:${GRIJS};white-space:nowrap">${escHtml(label)}</td>` +
    `<td style="padding:6px 18px 6px 0;font-size:13px;color:${TEKST};font-weight:600">${escHtml(waarde)}</td></tr>`,
  ).join('')
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;background:${VLAK};border:1px solid ${LIJN};` +
    `border-left:3px solid ${GROEN};margin:0 0 18px 0"><tbody>${rijen}</tbody></table>`
  )
}

/** Postentabel plus projectbezoek en reactiedatum, voor `extraHtml` van de uitvraagmail. */
export function bouwUitvraagPostenHtml(data: UitvraagPostenMailData): string {
  return bouwPostenTabelHtml(data.posten) + infoBlok([
    ['Projectbezoek', formatProjectbezoek(data.projectbezoekOp)],
    ['Reactie uiterlijk', nlDatum(data.reactieUiterlijk)],
  ])
}
