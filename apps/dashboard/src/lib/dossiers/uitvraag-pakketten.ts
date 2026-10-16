'use server'

/**
 * uitvraag-pakketten.ts — Server-acties voor uitvragen vanuit de calculatie (calculatie fase 6).
 * Zie uitvraag-pakket-types.ts voor het model.
 *
 * CONTRACT — de signaturen hieronder liggen vast; de schermen bouwen erop.
 */

import type {
  ActieResultaat, NieuwUitvraagPakket, UitvraagPakket,
} from './uitvraag-pakket-types'

/** Alle pakketten van een dossier, nieuwste eerst, met posten en partijen. */
export async function getUitvraagPakketten(dossierId: string): Promise<UitvraagPakket[]> {
  void dossierId
  throw new Error('nog niet gebouwd')
}

/**
 * Maakt het pakket, de posten en per partij een rij in dossier_uitvragen (status open, nog niet
 * gemaild: aangevraagd_op blijft leeg tot de mail echt weg is). Geeft de nieuwe uitvraag-ids terug
 * in de volgorde van `input.partijen`, zodat het scherm daarna per partij het mailvenster opent.
 */
export async function maakUitvraagPakket(
  input: NieuwUitvraagPakket,
): Promise<ActieResultaat<{ pakketId: string; uitvraagIds: string[] }>> {
  void input
  throw new Error('nog niet gebouwd')
}

/** Kiest met welke partij de calculatie rekent (of geen, met `null`). Hooguit één per pakket. */
export async function zetRekentMet(pakketId: string, uitvraagId: string | null): Promise<ActieResultaat> {
  void pakketId; void uitvraagId
  throw new Error('nog niet gebouwd')
}

/**
 * "Offerte binnen": zet de pdf (FormData-veld `bestand`) in de dossiermap (Bestanden) en zet de
 * uitvraag op ontvangen. Zonder bestand alleen de status.
 */
export async function markeerOfferteBinnen(
  uitvraagId: string,
  formData: FormData,
): Promise<ActieResultaat<{ url: string | null }>> {
  void uitvraagId; void formData
  throw new Error('nog niet gebouwd')
}
