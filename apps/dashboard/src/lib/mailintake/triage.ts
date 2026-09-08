/**
 * mailintake/triage.ts
 *
 * De goedkope voorselectie, vóór de AI. Twee doelen:
 *  - kosten besparen op post die overduidelijk geen werk is;
 *  - de automatische route dichthouden voor berichten die daar niet in horen,
 *    ongeacht wat het model er straks van vindt.
 *
 * De grondregel: uitsluiten mag alleen op signalen die *aantoonbaar* zijn (een
 * header, een bounce-onderwerp). Alles wat op inhoud lijkt te moeten worden
 * beoordeeld, gaat naar het model en daarna naar een mens. Een gemiste aanvraag
 * is duurder dan een overbodige AI-call.
 */

import type { GraphBericht } from '@/lib/o365/inbox'

/** Vrije-maildomeinen: daar zegt het domein niets over wélke klant het is. */
export const VRIJE_MAILDOMEINEN = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.nl', 'outlook.com', 'outlook.nl',
  'live.nl', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'yahoo.com', 'yahoo.co.uk',
  'ziggo.nl', 'kpnmail.nl', 'planet.nl', 'xs4all.nl', 'home.nl', 'casema.nl', 'chello.nl',
  'telfort.nl', 'upcmail.nl', 'zonnet.nl', 'quicknet.nl', 'hetnet.nl', 'proton.me', 'protonmail.com',
])

const AUTO_ONDERWERPEN = [
  'automatisch antwoord', 'automatische reactie', 'out of office', 'afwezigheidsassistent',
  'niet aanwezig', 'undeliverable', 'mail delivery failed', 'delivery status notification',
  'onbestelbaar', 'read receipt', 'gelezen:', 'niet gelezen:',
]

const ANTWOORD_PREFIXEN = /^\s*(re|fw|fwd|antw|antwoord|doorst|doorgestuurd)\s*(\[\d+\])?\s*:/i

export interface TriageUitkomst {
  /** Zeker geen werk; niet naar de AI sturen. */
  uitgesloten: boolean
  reden: string | null
  isAutomatischAntwoord: boolean
  /** Antwoord of doorstuur binnen een lopende conversatie. */
  isAntwoord: boolean
}

/**
 * Beoordeelt een bericht op harde signalen. Let op wat hier NIET staat: er wordt
 * niet uitgesloten op afzender die we niet kennen, op ontbrekende bijlagen, of op
 * een kort bericht. Dat zijn allemaal dingen die een echte aanvraag óók kan hebben.
 */
export function triageer(bericht: GraphBericht, negeerAdressen: Set<string>): TriageUitkomst {
  const onderwerp = (bericht.subject ?? '').toLowerCase().trim()
  const h = bericht.headers

  const autoSubmitted = (h['auto-submitted'] ?? '').toLowerCase()
  const isAutoHeader =
    (autoSubmitted !== '' && autoSubmitted !== 'no') ||
    'x-auto-response-suppress' in h ||
    (h['x-autoreply'] ?? '') !== '' ||
    (h['precedence'] ?? '').toLowerCase() === 'auto_reply'

  const isAutoOnderwerp = AUTO_ONDERWERPEN.some(p => onderwerp.startsWith(p) || onderwerp.includes(p))
  const isAutomatischAntwoord = isAutoHeader || isAutoOnderwerp

  const isAntwoord = ANTWOORD_PREFIXEN.test(bericht.subject ?? '')

  if (isAutomatischAntwoord) {
    return { uitgesloten: true, reden: 'Automatisch antwoord of onbestelbaarmelding', isAutomatischAntwoord, isAntwoord }
  }

  // Nieuwsbrieven en bulkmail dragen dit vrijwel altijd; echte klantmail nooit.
  if ('list-unsubscribe' in h || (h['precedence'] ?? '').toLowerCase() === 'bulk' || 'list-id' in h) {
    return { uitgesloten: true, reden: 'Nieuwsbrief of bulkmail', isAutomatischAntwoord, isAntwoord }
  }

  const van = (bericht.from ?? '').toLowerCase()
  const domein = van.includes('@') ? van.split('@')[1] : ''
  if (van && (negeerAdressen.has(van) || (domein && negeerAdressen.has('@' + domein)))) {
    return { uitgesloten: true, reden: 'Afzender staat op de negeerlijst', isAutomatischAntwoord, isAntwoord }
  }

  const heeftInhoud = Boolean((bericht.bodyPreview ?? '').trim() || bericht.body?.content?.trim())
  if (!heeftInhoud && !bericht.heeftBijlagen) {
    return { uitgesloten: true, reden: 'Leeg bericht zonder bijlagen', isAutomatischAntwoord, isAntwoord }
  }

  return { uitgesloten: false, reden: null, isAutomatischAntwoord, isAntwoord }
}

/** Het domein van een e-mailadres, of null. */
export function domeinVan(adres: string | null | undefined): string | null {
  const a = (adres ?? '').trim().toLowerCase()
  const i = a.lastIndexOf('@')
  return i > 0 && i < a.length - 1 ? a.slice(i + 1) : null
}

export function isVrijMaildomein(domein: string | null): boolean {
  return domein != null && VRIJE_MAILDOMEINEN.has(domein)
}

/**
 * Haalt de oorspronkelijke afzender uit een doorgestuurd bericht. Nodig omdat een
 * collega die een klantmail doorstuurt anders als "de klant" wordt herkend.
 * Zoekt de eerste Van:/From:-regel in de body die niet ons eigen domein is.
 */
export function afzenderUitDoorstuur(bodyTekst: string, eigenDomeinen: Set<string>): string | null {
  const regels = bodyTekst.split('\n').slice(0, 200)
  for (const regel of regels) {
    const m = regel.match(/^\s*(?:van|from|verzonden door)\s*:\s*.*?([\w.+-]+@[\w-]+\.[\w.-]+)/i)
    if (!m) continue
    const adres = m[1].toLowerCase()
    const d = domeinVan(adres)
    if (d && eigenDomeinen.has(d)) continue
    return adres
  }
  return null
}
