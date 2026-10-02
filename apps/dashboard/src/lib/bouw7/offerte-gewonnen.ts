/**
 * Een dossier wordt opdracht → de offerte in Bouw7 gaat op "04. Gewonnen", en het project krijgt
 * een aanneemsom als dat nog niet zo is.
 *
 * Waarom: Bouw7 kent een projectstatus én per offerte een eigen status, en die twee lopen niet
 * vanzelf gelijk op. Rederserf (20261.00546, sep 2026) ging in Bouw7 naar "03. Werkvoorbereiding"
 * terwijl de offerte op "03. Verstuurd" bleef staan. Het project had daardoor geen `fixedPrice`, de
 * Verkoop-tab toonde geen contracttotaal en er waren geen termijnen aan te maken — terwijl EVA wél
 * een aanneemsom liet zien (het bedrag van de offerte).
 *
 * Wordt alleen aangeroepen op het moment van de overgang naar opdracht (in EVA én via de sync),
 * nooit met terugwerkende kracht over alle opdrachten: oudere opdrachten met een offerte die niet op
 * Gewonnen staat hebben vrijwel allemaal een ingevulde aanneemsom en zijn zo bewust achtergelaten.
 *
 * De aanneemsom wordt alleen geschreven als Bouw7 er nog geen heeft (0 of leeg). Een bestaand
 * contractbedrag — bv. door EVA net vanuit de calculatie gezet — wordt nooit overschreven.
 */

import { getBouw7Client } from './sync'
import { schrijfBouw7Aanneemsom } from './project-velden'
import { kiesWinnendeOfferte, type OfferteKandidaat } from './offerte-gewonnen-keuze'
import { logFout } from '@/lib/fouten/log'

export type OfferteGewonnenResultaat =
  | {
      ok: true
      /** Offerte die nu op Gewonnen staat (null: project heeft geen open offerte). */
      offerteId: number | null
      statusGezet: boolean
      /** Bedrag dat als aanneemsom is geschreven; null als Bouw7 er al een had. */
      aanneemsom: number | null
    }
  | { ok: false; error: string }

type ListResp<T> = { items?: T[] }
type FinWaarde = { budgeted?: number | string | null } | null | undefined

const getal = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Status-id van "Gewonnen" uit de Bouw7-stamdata — niet hardcoded, de namen zijn door Everts zelf beheerd. */
async function gewonnenStatusId(client: Awaited<ReturnType<typeof getBouw7Client>>): Promise<number | null> {
  const lijst = await client.get<{ id: number; name?: string }[] | ListResp<{ id: number; name?: string }>>(
    '/organization/quotation-statuses',
  )
  const items = Array.isArray(lijst) ? lijst : (lijst.items ?? [])
  return items.find(s => (s.name ?? '').toLowerCase().includes('gewonnen'))?.id ?? null
}

export type OfferteGewonnenOpties = {
  /** False bij een regie-opdracht: die rekent op nacalculatie af, een vaste prijs hoort er niet op. */
  aanneemsom?: boolean
}

export async function bevestigOfferteGewonnenInBouw7(
  bouw7ProjectId: string | number,
  opties: OfferteGewonnenOpties = {},
): Promise<OfferteGewonnenResultaat> {
  try {
    const client = await getBouw7Client()
    const projectId = Number(bouw7ProjectId)

    // Begrensd door het projectfilter: een project heeft een handvol offertes.
    const lijst = await client.get<ListResp<OfferteKandidaat>>('/list/quotations', { q: `project.id = ${projectId}` })
    const keuze = kiesWinnendeOfferte(lijst.items ?? [])
    if (keuze.soort === 'geen') return { ok: true, offerteId: null, statusGezet: false, aanneemsom: null }

    const offerte = keuze.offerte
    let statusGezet = false
    if (keuze.soort === 'zet_gewonnen') {
      const statusId = await gewonnenStatusId(client)
      if (statusId == null) return { ok: false, error: 'Bouw7 kent geen offertestatus "Gewonnen".' }
      // Partiële upsert: alleen id + status. Onderwerp, aanhef, klant en regels blijven staan
      // (geverifieerd op 4202130, okt 2026). Ter controle hieronder het subtotaal opnieuw lezen.
      await client.post('/quotation', { id: offerte.id, quotationStatus: { id: statusId } })
      const na = await client.get<ListResp<OfferteKandidaat>>('/list/quotations', { q: `project.id = ${projectId}` })
      const naSubtotaal = getal(na.items?.find(q => q.id === offerte.id)?.subtotal)
      if (Math.abs(naSubtotaal - getal(offerte.subtotal)) > 0.005) {
        return {
          ok: false,
          error: `Offerte ${offerte.id} staat op Gewonnen, maar het offertebedrag veranderde van ${getal(offerte.subtotal)} naar ${naSubtotaal}. Controleer de offerte in Bouw7.`,
        }
      }
      statusGezet = true
    }

    if (opties.aanneemsom === false) return { ok: true, offerteId: offerte.id, statusGezet, aanneemsom: null }

    // Aanneemsom: alleen als Bouw7 er nog geen heeft. Een status "Gewonnen" vult hem niet zelf
    // (geverifieerd op 4202130, okt 2026): zonder deze write blijft het project op € 0 staan.
    const fin = await client.getAthena<{ fixedPrice?: FinWaarde }>(`/project-financial/${projectId}`)
    const huidig = getal(fin?.fixedPrice?.budgeted)
    const bedrag = getal(offerte.subtotal)
    let aanneemsom: number | null = null
    if (!(huidig > 0) && bedrag > 0) {
      const res = await schrijfBouw7Aanneemsom(projectId, bedrag)
      if (!res.ok) return { ok: false, error: `Offerte op Gewonnen gezet, aanneemsom niet: ${res.error}` }
      aanneemsom = bedrag
    }

    return { ok: true, offerteId: offerte.id, statusGezet, aanneemsom }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij offerte naar Gewonnen.' }
  }
}

/**
 * Zelfde, maar een mislukking komt in het foutenlogboek in plaats van stil te verdwijnen. Voor de
 * aanroepen waar niemand op het antwoord wacht (de sync, en de statuswissel waarvan het akkoord
 * al vastligt): de opdracht blijft staan, alleen moet iemand de offerte dan met de hand doen.
 */
export async function bevestigOfferteGewonnenEnLog(
  bouw7ProjectId: string | number,
  bron: string,
  omgeving: 'server' | 'cron',
  opties: OfferteGewonnenOpties = {},
): Promise<OfferteGewonnenResultaat> {
  const res = await bevestigOfferteGewonnenInBouw7(bouw7ProjectId, opties)
  if (!res.ok) {
    await logFout({
      omgeving,
      bron,
      soort: 'bouw7_offerte_gewonnen',
      melding: `Offerte niet op Gewonnen gezet (Bouw7-project ${bouw7ProjectId}): ${res.error}`,
      extra: { bouw7ProjectId: String(bouw7ProjectId) },
    })
  }
  return res
}
