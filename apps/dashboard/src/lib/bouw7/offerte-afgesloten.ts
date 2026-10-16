/**
 * Een offerte gaat in EVA op Verloren of Vervallen → de offertes van het project in Bouw7 ook.
 *
 * Waarom: EVA zette alleen het maatwerkveld "Offerte Sub-status" op het project. De Bouw7-offerte
 * zelf bleef op "03. Verstuurd" staan, en omdat het project pas naar "08. Afgewezen" gaat als álle
 * offertes verloren of vervallen zijn (`projectstatusPrefixVoor` in substatus-attr.ts), bleef een
 * in EVA verloren offerte in Bouw7 voor altijd als lopende offerte op "09. Verzonden offertes" staan.
 *
 * Gewonnen loopt hier niet door: dat doet `offerte-gewonnen.ts`, die ook de aanneemsom zet.
 */

import type { Bouw7Client } from './client'
import type { OfferteKandidaat } from './offerte-gewonnen-keuze'

export type Afsluiting = 'verloren' | 'vervallen'

type ListResp<T> = { items?: T[] }

const statusNaam = (q: OfferteKandidaat) => (q.quotationStatus?.name ?? '').toLowerCase()

/**
 * Welke offertes van het project moeten mee? Alles wat nog leeft: niet gewonnen en niet al
 * verloren of vervallen. Een al gewonnen offerte blijft staan, want die hoort bij een opdracht en
 * een verloren dossier mag een gewonnen offerte in Bouw7 nooit terugdraaien.
 */
export function kiesAfTeSluitenOffertes(offertes: OfferteKandidaat[]): OfferteKandidaat[] {
  return offertes.filter(q => !/gewonnen|verloren|vervallen/.test(statusNaam(q)))
}

/** Status-id uit de Bouw7-stamdata, op naam: de nummering beheert Everts zelf. */
async function statusIdVoor(client: Bouw7Client, afsluiting: Afsluiting): Promise<number | null> {
  const lijst = await client.get<{ id: number; name?: string }[] | ListResp<{ id: number; name?: string }>>(
    '/organization/quotation-statuses',
  )
  const items = Array.isArray(lijst) ? lijst : (lijst.items ?? [])
  return items.find(s => (s.name ?? '').toLowerCase().includes(afsluiting))?.id ?? null
}

export type OfferteAfgeslotenResultaat =
  | { ok: true; aantal: number }
  | { ok: false; error: string }

/**
 * Zet de levende offertes van een Bouw7-project op Verloren of Vervallen. Partiële upsert met
 * alleen id + status, zoals `bevestigOfferteGewonnenInBouw7` (onderwerp, regels en klant blijven).
 */
export async function sluitOffertesAfInBouw7(
  client: Bouw7Client,
  bouw7ProjectId: string | number,
  afsluiting: Afsluiting,
): Promise<OfferteAfgeslotenResultaat> {
  // Begrensd door het projectfilter: een project heeft een handvol offertes.
  const lijst = await client.get<ListResp<OfferteKandidaat>>('/list/quotations', {
    q: `project.id = ${Number(bouw7ProjectId)}`,
  })
  const teSluiten = kiesAfTeSluitenOffertes(lijst.items ?? [])
  if (teSluiten.length === 0) return { ok: true, aantal: 0 }

  const statusId = await statusIdVoor(client, afsluiting)
  if (statusId == null) return { ok: false, error: `Bouw7 kent geen offertestatus "${afsluiting}".` }

  for (const q of teSluiten) {
    await client.post('/quotation', { id: q.id, quotationStatus: { id: statusId } })
  }
  return { ok: true, aantal: teSluiten.length }
}
