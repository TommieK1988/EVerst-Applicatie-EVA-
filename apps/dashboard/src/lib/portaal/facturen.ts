import 'server-only'
import { vereisPortaalOnderdeel } from './auth'
import { getDossierVerkoop } from '@/lib/dossiers/actions'

/**
 * facturen.ts — de verstuurde verkoopfacturen van dit project.
 *
 * Hergebruikt `getDossierVerkoop()` (live uit Bouw7) maar neemt daar alléén de
 * facturenlijst uit over. Wat er bewust NIET uit meekomt:
 *  - `totalen` (aanneemsom, meerwerk, contracttotaal) — daar is de marge uit af
 *    te leiden zodra je er een offerte naast legt;
 *  - `termijnen` en `termijnenDekking` — ons facturatieschema, geen klantinfo;
 *  - `betaalgegevens` — die kent de klant zelf al beter dan wij.
 * En uit de EVA-tabel `debiteuren` komt hier niets: daar staan redencodes,
 * actiehouders en het interne opvolglogboek in.
 *
 * Een creditfactuur blijft wél staan: die hoort de klant juist te zien.
 */

export type PortaalFactuur = {
  nummer: string | null
  datum: string | null
  vervaldatum: string | null
  bedrag: number
  status: 'Betaald' | 'Openstaand' | 'Vervallen' | 'Creditnota'
}

export type PortaalFacturenData = {
  /** false = we konden Bouw7 niet bereiken; dan tonen we een nette melding i.p.v. "geen facturen". */
  beschikbaar: boolean
  facturen: PortaalFactuur[]
}

function statusVan(f: { betaald: boolean; isCredit: boolean; vervaldatum: string | null }): PortaalFactuur['status'] {
  if (f.isCredit) return 'Creditnota'
  if (f.betaald) return 'Betaald'
  // Vervallen is een feitelijke constatering, geen aanmaning: de toon van het
  // portaal is informeren, niet manen. Dat laatste doet debiteurenbeheer.
  if (f.vervaldatum && f.vervaldatum < new Date().toISOString().slice(0, 10)) return 'Vervallen'
  return 'Openstaand'
}

export async function getPortaalFacturen(dossierId: string): Promise<PortaalFacturenData> {
  await vereisPortaalOnderdeel(dossierId, 'facturen')

  const verkoop = await getDossierVerkoop(dossierId)

  // 'fout' betekent: er ís een Bouw7-koppeling maar hij antwoordde niet. Dat mag
  // nooit als "u heeft geen facturen" op het scherm komen.
  if (verkoop.bron === 'fout') return { beschikbaar: false, facturen: [] }

  return {
    beschikbaar: true,
    facturen: verkoop.facturen.map(f => ({
      nummer: f.factuurnummer,
      datum: f.datum,
      vervaldatum: f.vervaldatum,
      bedrag: f.bedrag,
      status: statusVan(f),
    })),
  }
}
