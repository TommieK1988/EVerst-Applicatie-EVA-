/**
 * uitvraag-pakket-types.ts — Uitvragen vanuit de calculatie (calculatie fase 6).
 *
 * Een pakket is "wat er wordt uitgevraagd" (bijv. "Voegwerk gevel achter"), met nul of meer
 * posten uit de calculatie. Per partij staat er een rij in `dossier_uitvragen` met `pakket_id`.
 * Zonder posten is het een losse uitvraag, bijvoorbeeld een inmeter.
 *
 * "Rekent met" is de keuze met welke partij de calculatie rekent. Dat is nog geen gunning: die
 * volgt pas na klantakkoord, bij de inkoop. Het bedrag vult de calculator zelf in bij de post.
 *
 * Geen 'use server': dit bestand wordt gedeeld door de server-acties en de schermen.
 */

import type { DossierUitvraag, UitvraagSoort } from '@everts/database'

/**
 * Een calculatieregel zoals hij is uitgevraagd: een kopie, want de regel zelf kan later wijzigen.
 * Bij een materiaallijst is `calculatieregel_id` leeg: één regel kan uit meerdere posten komen.
 */
export interface UitvraagPost {
  calculatieregel_id: string
  omschrijving: string
  hoeveelheid: number | null
  eenheid: string | null
}

/** Een partij die je in het venster kiest. */
export interface UitvraagPartijKeuze {
  relatie_id: string | null
  naam: string
}

/**
 * Wat er in de uitvraag staat: de posten zoals ze in de calculatie staan (onderaannemer), of
 * een materiaallijst uit de normen van die posten (leverancier, groothandel).
 */
export type UitvraagInhoud = 'posten' | 'materialen'

export interface NieuwUitvraagPakket {
  dossierId: string
  naam: string
  soort: UitvraagSoort
  inhoud: UitvraagInhoud
  /** Calculatieversie waar de posten uit komen; leeg bij een losse uitvraag. */
  scenarioId: string | null
  posten: UitvraagPost[]
  partijen: UitvraagPartijKeuze[]
  /** yyyy-mm-dd */
  reactieUiterlijk: string | null
  /** ISO-tijdstip, of leeg. */
  projectbezoekOp: string | null
}

/** Eén partij binnen een pakket, met wat de schermen nodig hebben. */
export interface UitvraagPakketPartij extends DossierUitvraag {
  pakket_id: string | null
  rekent_mee: boolean
  offerte_bestand_naam: string | null
  offerte_bestand_url: string | null
  /** Dagen sinds aangevraagd_op, of null als hij nog niet is gemaild. */
  dagen_open: number | null
  /** E-mailadres van de relatie (voor het mailvenster). */
  partij_email: string | null
}

export interface UitvraagPakket {
  id: string
  dossier_id: string
  naam: string
  soort: UitvraagSoort
  inhoud: UitvraagInhoud
  scenario_id: string | null
  reactie_uiterlijk: string | null
  projectbezoek_op: string | null
  created_at: string
  posten: UitvraagPost[]
  partijen: UitvraagPakketPartij[]
}

/** Wat het calculatiegrid per regel toont: "Uitgevraagd · 2" of "Rekent met Voegbedrijf A". */
export interface RegelUitvraagStatus {
  /** Aantal partijen dat voor deze regel is uitgevraagd (niet ingetrokken/afgevallen). */
  uitgevraagd: number
  /** Naam van de partij waarmee gerekend wordt, als die gekozen is. */
  rekentMet: string | null
  pakketId: string
}

export type ActieResultaat<T = null> = { ok: true; data: T } | { ok: false; error: string }
