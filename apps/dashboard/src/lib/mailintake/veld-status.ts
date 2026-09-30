/**
 * Van "wat staat er in dit veld" naar "welke kleur krijgt het".
 *
 * Het behandelscherm toont alle velden altijd op dezelfde plek; de kleur doet het
 * werk dat eerder een wisselende veldenlijst deed. Groen betekent: ingevuld en er
 * valt niets na te kijken. Oranje: ingevuld, maar kijk er even naar. Rood: leeg
 * terwijl het nodig is.
 *
 * WAAROM `vastgesteld` BESTAAT
 * De score van het model is een zelfrapportage over één mail. Zodra een waarde
 * ergens anders vandaan komt -- een regel die hem afleidt, de adresservice die hem
 * bevestigt, het gekozen dossier, of de behandelaar die hem zelf heeft ingevuld --
 * zegt die score niets meer. Zonder dit onderscheid moest de werkmaatschappij een
 * kunstmatige score van 1 krijgen om niet oranje te worden, en bleef een veld dat
 * iemand zojuist had nagekeken oranje staan alsof EVA er nog over twijfelde.
 *
 * Bewust géén `'use server'`: het scherm is een client-component.
 */

import type { Relevantie, VeldSleutel } from './veld-eisen'
import { ALLE_VELDEN } from './veld-eisen'
import { VELD_BETROUWBAAR } from './types'

export type VeldStatus = 'zeker' | 'twijfel' | 'ontbreekt' | 'gedimd' | 'neutraal'

export interface VeldWaarneming {
  /** Staat er op dit moment iets in het veld? */
  gevuld: boolean
  /** Het vertrouwen van het model; `undefined` = het model zei er niets over. */
  score?: number
  /** De waarde komt niet uit een gok: een regel, de adresservice, het dossier, of een mens. */
  vastgesteld?: boolean
  /** Wat er op het gekozen dossier staat, als dat iets ánders is dan deze waarde. */
  afwijkendInDossier?: string | null
}

export interface VeldOordeel {
  status: VeldStatus
  /** Waarom deze kleur, in gewone taal. Gaat naar de hovertekst. */
  reden: string
  /** De score, als die nog iets betekent; anders null (dan komt er geen percentage). */
  score: number | null
}

/**
 * De volgorde is de hele logica.
 *
 * `nvt` gaat vóór alles: een veld dat bij deze afhandeling geen rol speelt mag niet
 * rood worden omdat het leeg is, en niet groen omdat het toevallig gevuld is.
 */
export function beoordeelVeld(w: VeldWaarneming, relevantie: Relevantie): VeldOordeel {
  if (relevantie === 'nvt') {
    return {
      status: 'gedimd',
      reden: 'Speelt bij deze afhandeling geen rol.',
      score: null,
    }
  }

  if (!w.gevuld) {
    return relevantie === 'verplicht'
      ? { status: 'ontbreekt', reden: 'Dit is nodig om verder te kunnen.', score: null }
      : { status: 'neutraal', reden: 'Niet ingevuld.', score: null }
  }

  // Een afwijking tussen mail en dossier is het interessantste geval dat er is: geen
  // van beide is fout, maar iemand moet kiezen. Gaat vóór de score, want die zegt
  // alleen iets over hoe goed de mail gelezen is.
  if (w.afwijkendInDossier) {
    return {
      status: 'twijfel',
      reden: `Op het dossier staat: ${w.afwijkendInDossier}`,
      score: w.score ?? null,
    }
  }

  if (w.vastgesteld) {
    return { status: 'zeker', reden: 'Vastgesteld, niet geraden.', score: null }
  }

  if (w.score != null && w.score >= VELD_BETROUWBAAR) {
    return { status: 'zeker', reden: 'EVA is hier zeker van.', score: w.score }
  }

  return {
    status: 'twijfel',
    reden: w.score != null ? 'Controleer dit veld.' : 'EVA heeft dit afgeleid; controleer het.',
    score: w.score ?? null,
  }
}

export type Oordelen = Record<VeldSleutel, VeldOordeel>

export function beoordeelAlleVelden(
  waarnemingen: Partial<Record<VeldSleutel, VeldWaarneming>>,
  eisen: Record<VeldSleutel, Relevantie>,
): Oordelen {
  const uit = {} as Oordelen
  for (const veld of ALLE_VELDEN) {
    uit[veld] = beoordeelVeld(waarnemingen[veld] ?? { gevuld: false }, eisen[veld])
  }
  return uit
}

/**
 * De velden die de afhandeling tegenhouden, in schermvolgorde.
 *
 * Voedt zowel de knop als de regel eronder. Dat die twee uit dezelfde bron komen is
 * het punt: eerder stond de voorwaarde in een `compleet`-expressie en de uitleg in
 * een met de hand getypte zin, en die konden uit elkaar lopen.
 */
export function ontbrekendeVelden(oordelen: Oordelen): VeldSleutel[] {
  return ALLE_VELDEN.filter(v => oordelen[v]?.status === 'ontbreekt')
}

/** Kan deze afhandeling door? */
export function magAfhandelen(oordelen: Oordelen): boolean {
  return ontbrekendeVelden(oordelen).length === 0
}
