/**
 * Gedeelde hash-logica voor de goedkeuringsworkflow (werkbegroting + offerte).
 *
 * Client én server berekenen exact dezelfde SHA-256-hash over een canonieke
 * JSON-weergave (vaste veldvolgorde, genormaliseerde getallen). De client
 * gebruikt de hashes voor regel-badges; de server voor de gates (bestelling
 * verzenden, prognose, offerte verzenden). Omdat de server de hash altijd
 * zelf herberekent uit de gesynchroniseerde data, kan een client geen
 * "goedgekeurd" forceren.
 */

import type { WerkbegrotingRegel, WerkbegrotingComponent } from './types'

/** Getallen normaliseren zodat 12.100000000000001 en 12.1 dezelfde hash geven. */
function num(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0
  return Math.round(v * 10000) / 10000
}

function str(v: string | null | undefined): string {
  return (v ?? '').trim()
}

async function sha256(tekst: string): Promise<string> {
  const data = new TextEncoder().encode(tekst)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Canonieke weergave van één component (alleen goedkeuringsrelevante velden). */
function componentCanoniek(c: Pick<WerkbegrotingComponent,
  'id' | 'type' | 'norm_hoeveelheid' | 'eenheid' | 'tarief' | 'opslag_pct' | 'omschrijving' | 'relatie_id' | 'leverancier_naam' | 'aannemersnaam' | 'offertenummer'
>): unknown[] {
  return [
    c.id, c.type, num(c.norm_hoeveelheid), str(c.eenheid), num(c.tarief),
    num(c.opslag_pct), str(c.omschrijving), str(c.relatie_id),
    str(c.leverancier_naam), str(c.aannemersnaam), str(c.offertenummer),
  ]
}

export type HashbareRegel = Pick<WerkbegrotingRegel,
  'omschrijving' | 'hoeveelheid' | 'eenheid' | 'kostengroep' | 'opslag_pct' | 'btw_pct' | 'is_stelpost'
>

/**
 * Hash van één werkbegroting-regel inclusief zijn actieve (niet-verwijderde)
 * componenten. Componenten worden op id gesorteerd zodat de volgorde niet uitmaakt.
 */
export async function hashWerkbegrotingRegel(
  regel: HashbareRegel,
  componenten: WerkbegrotingComponent[],
): Promise<string> {
  const comps = componenten
    .filter(c => !c.is_verwijderd)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(componentCanoniek)
  const canoniek = [
    str(regel.omschrijving), num(regel.hoeveelheid), str(regel.eenheid),
    str(regel.kostengroep), num(regel.opslag_pct), num(regel.btw_pct),
    regel.is_stelpost === true,
    comps,
  ]
  return sha256(JSON.stringify(canoniek))
}

/**
 * Hash over een set componenten — snapshot van een bestelling bij het
 * klaarzetten. Wijkt de actuele hash af, dan is de bestelling "verouderd".
 */
export async function hashComponentenSet(componenten: WerkbegrotingComponent[]): Promise<string> {
  const comps = componenten
    .filter(c => !c.is_verwijderd)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(componentCanoniek)
  return sha256(JSON.stringify(comps))
}

export type HashbareOfferteRegel = {
  id: string
  omschrijving: string | null
  hoeveelheid: number | null
  eenheidsprijs: number | null
  btw_pct: number | null
}

/**
 * Hash van de offerte-inhoud op het goedkeurmoment. Wordt bewaard in
 * `goedkeuringen.object_hash`; wijzigt de offerte daarna, dan matcht de hash
 * niet meer en is opnieuw goedkeuring nodig.
 */
export async function hashOfferte(
  regels: HashbareOfferteRegel[],
  subtotaalExBtw: number,
): Promise<string> {
  const rs = regels
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => [r.id, str(r.omschrijving), num(r.hoeveelheid), num(r.eenheidsprijs), num(r.btw_pct)])
  return sha256(JSON.stringify([num(subtotaalExBtw), rs]))
}
