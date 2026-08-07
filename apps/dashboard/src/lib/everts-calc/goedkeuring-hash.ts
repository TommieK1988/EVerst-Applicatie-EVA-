/**
 * Gedeelde hash-logica voor de goedkeuringsworkflow (werkbegroting + offerte).
 *
 * Client én server berekenen exact dezelfde fingerprint over een canonieke
 * weergave (vaste veldvolgorde, genormaliseerde getallen). De client gebruikt ze
 * voor regel-badges; de server voor de gates (bestelling verzenden, prognose,
 * offerte verzenden). Omdat de server altijd zelf herberekent uit de
 * gesynchroniseerde data, kan een client geen "goedgekeurd" forceren.
 *
 * Let op het verschil in bereik. Een *goedkeuring* gaat over geld en kijkt dus
 * alleen naar `kostenInCenten`; een *klaargezette bestelling* moet inhoudelijk
 * kloppen en kijkt met `hashComponentenSet` naar alle velden — daar is een
 * gewisselde leverancier juist wél een reden om de bestelling bij te werken.
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

/** Canonieke weergave van één component (inhoud van een bestelregel). */
function componentCanoniek(c: Pick<WerkbegrotingComponent,
  'id' | 'type' | 'norm_hoeveelheid' | 'eenheid' | 'tarief' | 'opslag_pct' | 'omschrijving' | 'relatie_id' | 'leverancier_naam' | 'aannemersnaam' | 'offertenummer'
>): unknown[] {
  return [
    c.id, c.type, num(c.norm_hoeveelheid), str(c.eenheid), num(c.tarief),
    num(c.opslag_pct), str(c.omschrijving), str(c.relatie_id),
    str(c.leverancier_naam), str(c.aannemersnaam), str(c.offertenummer),
  ]
}

export type HashbareRegel = Pick<WerkbegrotingRegel, 'hoeveelheid'>

/** Rekenwaarde: null/NaN telt als 0. Bewust géén afronding vooraf — zie kostenInCenten. */
function getal(v: number | null | undefined): number {
  return v == null || !Number.isFinite(v) ? 0 : v
}

/**
 * Kostprijs van één regel in hele centen: Σ hoeveelheid × normhoeveelheid × tarief
 * over de actieve componenten. Exact dezelfde som als het werkbegrotingstotaal op
 * het scherm.
 *
 * Per component afronden (in plaats van pas aan het eind) houdt de uitkomst
 * onafhankelijk van de volgorde waarin de componenten binnenkomen — client en
 * server krijgen ze niet gegarandeerd in dezelfde volgorde terug.
 */
export function kostenInCenten(
  regel: HashbareRegel,
  componenten: WerkbegrotingComponent[],
): number {
  const hoeveelheid = getal(regel.hoeveelheid)
  return componenten
    .filter(c => !c.is_verwijderd)
    .reduce((som, c) => som + Math.round(hoeveelheid * getal(c.norm_hoeveelheid) * getal(c.tarief) * 100), 0)
}

export type HashbareRegelInhoud = Pick<WerkbegrotingRegel,
  'omschrijving' | 'hoeveelheid' | 'eenheid' | 'kostengroep' | 'opslag_pct' | 'btw_pct' | 'is_stelpost'
>

/**
 * Hash over de vólledige inhoud van een regel: elk veld dat een gebruiker kan
 * aanraken telt mee.
 *
 * Dit wás de maatstaf voor de goedkeuring, maar dat sloeg te ver door — een
 * andere leverancier of een andere bewakingscode kost niets extra en hoort geen
 * nieuw akkoord te vragen. Daarvoor telt nu alleen `kostenInCenten`.
 *
 * De hash wordt nog wél bij elk akkoord meegeschreven in `regel_hash`, zodat een
 * deploy met de oude vergelijking (productie tijdens de uitrol, een preview-omgeving)
 * op dezelfde database gewoon blijft werken. Hij dient ook als terugval voor
 * snapshots van vóór de kostenkolom: zolang de hash matcht is de regel ongewijzigd,
 * en dus ook ongewijzigd in prijs.
 */
export async function hashWerkbegrotingRegelInhoud(
  regel: HashbareRegelInhoud,
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
 *
 * `wordVersie` is de versiemarker van een gekoppeld Word-document (item-id +
 * cTag). Zonder die marker zou een bewerking in Word Online ná de goedkeuring
 * onopgemerkt de deur uit gaan: de regels in de database veranderen daar immers
 * niet van. Het veld wordt alléén toegevoegd wanneer er een Word-document hangt,
 * zodat de hash van alle bestaande (sjabloon-)offertes ongewijzigd blijft.
 */
export async function hashOfferte(
  regels: HashbareOfferteRegel[],
  subtotaalExBtw: number,
  wordVersie?: string | null,
): Promise<string> {
  const rs = regels
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(r => [r.id, str(r.omschrijving), num(r.hoeveelheid), num(r.eenheidsprijs), num(r.btw_pct)])
  const canoniek: unknown[] = [num(subtotaalExBtw), rs]
  if (wordVersie) canoniek.push(wordVersie)
  return sha256(JSON.stringify(canoniek))
}
