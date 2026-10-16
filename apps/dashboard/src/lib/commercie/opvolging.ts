/**
 * Regels van de offerteopvolging (afgesproken okt 2026). Puur en zonder `'use server'`, zodat
 * de lijst, de kaart, de server-actions en de nachtelijke run hetzelfde rekenen.
 *
 *  - Nabellen of niet: per bedragklasse, per offerte te overrulen ("altijd" / "niet").
 *  - Stilstand: waarom een offerte stilligt, uit een vaste lijst, plus wanneer de klant beslist.
 *  - Mega (vanaf € 125k): eigenaar is een projectleider of de directie, en wachten we op de
 *    klant, dan toch uiterlijk elke twee weken een hercontrole. Het besluitmoment blijft staan.
 *  - Ontvangstcontrole: drie werkdagen na verzenden belt de managementassistent of de offerte
 *    goed is aangekomen; bij een mega doet de eigenaar dat zelf, bij klein niemand.
 *  - Kleine offertes die niemand nabelt, vervallen 30 dagen na de geldigheid vanzelf.
 */

import { dagenTussenKalender } from '@/lib/dossiers/datum-regels'
import type { Bedragklasse } from './bedragklassen'
import { werkdagenVooruit, type UitkomstSleutel } from './types'

// ── Nabellen of niet ─────────────────────────────────────────────────────────

export type Opvolging = 'altijd' | 'niet'

export const OPVOLGING_KEUZES: { waarde: Opvolging | null; label: string; uitleg: string }[] = [
  { waarde: null,     label: 'Automatisch',     uitleg: 'Op bedrag: onder € 3k niet, daarboven wel' },
  { waarde: 'altijd', label: 'Altijd nabellen', uitleg: 'Ook als hij klein is' },
  { waarde: 'niet',   label: 'Niet nabellen',   uitleg: 'Afgestemd, of de klant meldt zich zelf' },
]

export function alsOpvolging(v: unknown): Opvolging | null {
  return v === 'altijd' || v === 'niet' ? v : null
}

/** Hoort deze offerte in de nabellijst? De keuze op de offerte wint van de bedragklasse. */
export function wordtNagebeld(klasse: Bedragklasse, opvolging: Opvolging | null): boolean {
  if (opvolging === 'altijd') return true
  if (opvolging === 'niet') return false
  return klasse !== 'klein'
}

// ── Stilstand ────────────────────────────────────────────────────────────────

export type StilReden =
  | 'klant_beoordeelt' | 'besluit_alv' | 'budget_later'
  | 'aanpassing_door_ons' | 'wacht_op_adviseur' | 'geen_reactie'

/** Vaste lijst: vrije tekst levert twintig varianten van "klant denkt na" op. */
export const STIL_REDENEN: { sleutel: StilReden; label: string }[] = [
  { sleutel: 'klant_beoordeelt',    label: 'Klant beoordeelt' },
  { sleutel: 'besluit_alv',         label: 'Besluit ALV/bestuur' },
  { sleutel: 'budget_later',        label: 'Budget of planning later' },
  { sleutel: 'aanpassing_door_ons', label: 'Wacht op aanpassing door ons' },
  { sleutel: 'wacht_op_adviseur',   label: 'Wacht op adviseur/beheerder' },
  { sleutel: 'geen_reactie',        label: 'Geen reactie' },
]

export const STIL_REDEN_LABEL = Object.fromEntries(
  STIL_REDENEN.map(r => [r.sleutel, r.label]),
) as Record<StilReden, string>

export function alsStilReden(v: unknown): StilReden | null {
  return typeof v === 'string' && v in STIL_REDEN_LABEL ? (v as StilReden) : null
}

/**
 * De reden die bij een uitkomst voor de hand ligt; de gebruiker kan hem wijzigen. `undefined`
 * = de uitkomst zegt niets over stilstand, laat staan wat er stond.
 */
export function standaardStilReden(uitkomst: UitkomstSleutel): StilReden | null | undefined {
  switch (uitkomst) {
    case 'klant_komt_terug':        return 'klant_beoordeelt'
    case 'ligt_bij_alv':            return 'besluit_alv'
    case 'uitgesteld':              return 'budget_later'
    case 'offerte_aanpassen':       return 'aanpassing_door_ons'
    case 'waarschijnlijk_opdracht':
    case 'verloren':                return null
    default:                        return undefined
  }
}

// ── Mega ─────────────────────────────────────────────────────────────────────

/** Bij een mega wachten we nooit langer dan dit zonder hercontrole (10 werkdagen = 2 weken). */
export const MEGA_HERCONTROLE_WERKDAGEN = 10

/**
 * Begrenst de vervolgdatum van een mega-offerte. Ligt het besluit verder weg dan twee weken,
 * dan wordt de stap een hercontrole over twee weken en blijft de oorspronkelijke datum als
 * besluitdatum bewaard. Zo hoor je tussentijds of het nog loopt, zonder de afspraak te verliezen.
 */
export function begrensMegaHercontrole(
  stapDatum: string,
  vandaag: string,
): { stapDatum: string; besluitDatum: string | null } {
  const uiterlijk = werkdagenVooruit(vandaag, MEGA_HERCONTROLE_WERKDAGEN)
  return stapDatum > uiterlijk
    ? { stapDatum: uiterlijk, besluitDatum: stapDatum }
    : { stapDatum, besluitDatum: null }
}

/** Mag deze functie eigenaar zijn van een mega-offerte? Projectleider of directie. */
export function magMegaEigenaarZijn(functie: string | null | undefined): boolean {
  return /projectleider|directie|directeur/i.test(functie ?? '')
}

// ── Automatisch ──────────────────────────────────────────────────────────────

export const ONTVANGSTCONTROLE_WERKDAGEN = 3
export const ONTVANGSTCONTROLE_TEKST = 'Ontvangst offerte controleren'

/** Kleine offertes vervallen zoveel dagen na de geldigheid, als niemand ze opvolgt. */
export const AUTO_VERVALLEN_NA_DAGEN = 30

/**
 * Wie de ontvangstcontrole doet. Klein: niemand (die bellen we niet). Mega: de eigenaar, want
 * die moet de klant toch spreken. De rest: de managementassistent uit de instellingen.
 */
export function ontvangstcontroleDoor(
  klasse: Bedragklasse,
  opvolging: Opvolging | null,
  opts: { assistentId: string | null; eigenaarId: string | null },
): string | null {
  if (!wordtNagebeld(klasse, opvolging)) return null
  if (klasse === 'mega') return opts.eigenaarId ?? opts.assistentId
  return opts.assistentId
}

/** Vervalt deze offerte vanzelf? Alleen klein, niet op "altijd nabellen", en ruim verlopen. */
export function vervaltAutomatisch(p: {
  klasse: Bedragklasse
  opvolging: Opvolging | null
  geldigTot: string | null
  vandaag: string
}): boolean {
  if (p.klasse !== 'klein' || p.opvolging === 'altijd' || !p.geldigTot) return false
  const dagen = dagenTussenKalender(p.geldigTot, p.vandaag)
  return dagen != null && dagen >= AUTO_VERVALLEN_NA_DAGEN
}
