/**
 * Gedeelde poortwachter voor het verzenden/aanmaken van een bestelling.
 *
 * Twee acties leunen hierop: `verzendBestelling` (alleen een EVA-status) en
 * `maakBestellingInBouw7` (maakt het echte inkoopdocument). Ze moeten exact dezelfde
 * voorwaarden hanteren — een tweede, iets afwijkende kopie zou betekenen dat de zwaarste
 * actie (een order de deur uit) op de losse controle draait.
 *
 * Voorwaarden:
 *  (a) élke werkbegroting-regel achter de bestelde componenten is geaccordeerd;
 *  (b) de componenten zijn niet gewijzigd sinds het klaarzetten (hash-vergelijking).
 *
 * Staat bewust in een gewone lib (geen 'use server'), zodat beide server actions hem kunnen
 * importeren zonder er een extra aanroepbaar endpoint van te maken.
 */

import type { WerkbegrotingComponent, WerkbegrotingRegel } from './types'

export type BestellingGateInvoer = {
  bestellingId: string
  /** Werkbegroting-id van de bestelling (uit de Supabase-rij). */
  werkbegrotingId: string
  /** Componenten-hash zoals vastgelegd bij het klaarzetten. */
  componentenHash: string | null
  /** Component-ids uit de junction-tabel. */
  componentIds: Set<string>
  componenten: WerkbegrotingComponent[]
  regels: WerkbegrotingRegel[]
}

export type BestellingGateResultaat =
  | { ok: true; componenten: WerkbegrotingComponent[] }
  | { ok: false; reden: 'niet_goedgekeurd' | 'verouderd' | 'fout'; error: string; regels?: string[] }

export async function controleerBestellingGates(
  invoer: BestellingGateInvoer,
): Promise<BestellingGateResultaat> {
  const { hashComponentenSet } = await import('./goedkeuring-hash')
  const { berekenWerkbegrotingStatus } = await import('@/lib/goedkeuring/werkbegroting-status')

  if (invoer.componentIds.size === 0) {
    return { ok: false, reden: 'fout', error: 'Bestelling heeft geen componenten.' }
  }

  const componenten = invoer.componenten.filter(c => invoer.componentIds.has(c.id) && !c.is_verwijderd)
  if (componenten.length !== invoer.componentIds.size) {
    return { ok: false, reden: 'verouderd', error: 'Eén of meer bestelde componenten bestaan niet meer — werk de bestelling bij.' }
  }

  // (b) Verouderd-check: componenten gewijzigd sinds klaarzetten?
  const actueleHash = await hashComponentenSet(componenten)
  if (!invoer.componentenHash || actueleHash !== invoer.componentenHash) {
    return { ok: false, reden: 'verouderd', error: 'De werkbegroting is gewijzigd sinds deze bestelling is klaargezet — werk de bestelling bij.' }
  }

  // (a) Regel-goedkeuring: elke regel achter de bestelde componenten moet geaccordeerd zijn.
  const status = await berekenWerkbegrotingStatus(invoer.werkbegrotingId)
  const goedgekeurdPerRegel = new Map(status.regels.map(r => [r.regel_id, r.goedgekeurd]))
  const regelIds = [...new Set(componenten.map(c => c.werkbegroting_regel_id))]
  const geblokkeerd = regelIds.filter(id => goedgekeurdPerRegel.get(id) !== true)
  if (geblokkeerd.length > 0) {
    const regelById = new Map(invoer.regels.map(r => [r.id, r]))
    return {
      ok: false, reden: 'niet_goedgekeurd',
      error: 'Deze bestelling bevat regels die (nog) niet zijn geaccordeerd.',
      regels: geblokkeerd.map(id => regelById.get(id)?.omschrijving || 'Onbekende regel'),
    }
  }

  return { ok: true, componenten }
}
