import 'server-only'

/**
 * Schrijft een EVA-besluit over een inkoopfactuur naar Bouw7: eerst een tekstregel in `comments`
 * (wie, wanneer), daarna de status. Zie WRITE-ENDPOINTS.md §7c (live getest 13-10-2026).
 *
 * **De volgorde is de garantie.** Mislukt de tekst, dan zetten we de status niet: liever een
 * factuur die nog ter goedkeuring staat dan een goedgekeurde factuur zonder naam eronder. Mislukt
 * de status ná de tekst, dan is een herhaling veilig — `voegRegelToe` schrijft dezelfde regel
 * geen tweede keer.
 *
 * `comments` gaat via `POST /purchase-invoice` met het volledige detail-document (er is geen smal
 * endpoint), net als de interne notitie op verkoopfacturen (`invoice-note.ts`). Daarom controleren
 * we na de write de fiscale kern: factuurnummer, datums, regels, boeking en Exact-id.
 */

import { getBouw7Client } from './sync'
import { voegRegelToe } from '@/lib/inkoopfacturen/goedkeur-route'

/** Bouw7-factuurstatus na het besluit. Zie `inkoop-status.ts`. */
const STATUS_NA: Record<'goedgekeurd' | 'afgekeurd', number> = { goedgekeurd: 2, afgekeurd: 5 }

type Detail = {
  id?: number
  invoiceNumber?: string | null
  date?: string | null
  dueDate?: string | null
  datePaid?: string | null
  status?: number
  isBooked?: boolean
  bookNumber?: number | null
  exactId?: string | null
  comments?: string | null
  contact?: { id?: number } | null
  division?: { id?: number } | null
  lines?: { id?: number; quantity?: string | number; unitPrice?: string | number; subTotal?: string | number; vatTariffPercentage?: string | number }[]
  [k: string]: unknown
}

function fiscaleKern(d: Detail): string {
  return JSON.stringify({
    id: d.id ?? null, nr: d.invoiceNumber ?? null, d: d.date ?? null, dd: d.dueDate ?? null, dp: d.datePaid ?? null,
    b: d.isBooked ?? null, bn: d.bookNumber ?? null, ex: d.exactId ?? null,
    c: d.contact?.id ?? null, div: d.division?.id ?? null,
    l: (d.lines ?? []).map(l => [l.id, String(l.quantity), String(l.unitPrice), String(l.subTotal), String(l.vatTariffPercentage)]),
  })
}

export type BesluitWriteResultaat = { ok: true } | { ok: false; error: string }

export async function schrijfBesluitNaarBouw7(
  bouw7InvoiceId: string,
  besluit: 'goedgekeurd' | 'afgekeurd',
  regel: string,
): Promise<BesluitWriteResultaat> {
  try {
    const client = await getBouw7Client()
    const pad = `/purchase-invoicing/purchase-invoice/${bouw7InvoiceId}`
    const huidig = await client.get<Detail>(pad)
    if (huidig?.id == null || String(huidig.id) !== String(bouw7InvoiceId)) {
      return { ok: false, error: `Bouw7-factuur ${bouw7InvoiceId} niet gevonden.` }
    }
    if (huidig.datePaid) {
      return { ok: false, error: 'Deze factuur is in Bouw7 al betaald; de status is niet meer aangepast.' }
    }

    const nieuweTekst = voegRegelToe(huidig.comments, regel)
    if (nieuweTekst !== (huidig.comments ?? '').trimEnd()) {
      await client.post('/purchase-invoice', { ...huidig, comments: nieuweTekst })
      const na = await client.get<Detail>(pad)
      if (fiscaleKern(na) !== fiscaleKern(huidig)) {
        return {
          ok: false,
          error: `Let op: de tekst staat in Bouw7, maar factuur ${huidig.invoiceNumber ?? bouw7InvoiceId} kwam gewijzigd terug. De status is níét aangepast — controleer de factuur in Bouw7.`,
        }
      }
      if (!(na.comments ?? '').includes(regel)) {
        return { ok: false, error: 'Bouw7 heeft de tekstregel niet opgeslagen; de status is niet aangepast.' }
      }
    }

    const doel = STATUS_NA[besluit]
    if (huidig.status !== doel) {
      await client.put(`/purchase-invoice/${bouw7InvoiceId}/update-status/${doel}`)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij het bijwerken van Bouw7.' }
  }
}
