/**
 * Two-way interne factuurnotitie: schrijft een nieuwe EVA-logboekregel bij in de interne
 * notitie van de verkoopfactuur in Bouw7.
 *
 * Mechaniek (zie lib/bouw7/WRITE-ENDPOINTS.md §7a):
 *  - read-modify-write: `GET /invoice/{id}` → alléén `internalNote` vervangen →
 *    `POST /invoice` met het volledige document terug (de POST is een upsert op `id`).
 *  - Er is géén smal notitie-endpoint: `/invoice/{id}` staat alleen GET en DELETE toe en een
 *    `/invoice/set-internal-note` bestaat niet (beide geverifieerd tegen de live API).
 *
 * Waarom het volledige document terug moet: de POST verwacht een `InvoiceDocument` en de
 * Bouw7-UI stuurt zelf ook alles mee. We sturen daarom letterlijk terug wat we ophaalden —
 * inclusief de audit-velden — met precies één gewijzigd veld. Dat houdt de afwijking t.o.v.
 * wat de UI doet zo klein mogelijk; op een factuur is dat geen overbodige voorzichtigheid.
 *
 * Na de write controleren we de fiscale kern van het teruggegeven document (factuurnummer,
 * status, datums, bedragen, regels). Wijkt daar iets af, dan is de notitie wél geschreven maar
 * melden we dat hard: op een factuur mag zoiets nooit stil blijven.
 *
 * Faalt nooit hard richting de gebruiker: bij een fout → `{ ok:false, error }`, zodat de
 * logboekregel in EVA gewoon blijft staan. Kosten van een mislukte write zijn dan hooguit de
 * spiegeling in Bouw7; de eerstvolgende sync leest de Bouw7-notitie ongewijzigd terug.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7WriteResult } from '@/lib/dossiers/bouw7-status'

/** Het deel van `InvoiceDocument` dat we zelf aanraken of controleren. De rest gaat ongezien mee. */
type Bouw7InvoiceDocument = {
  id?: number | null
  invoiceNumber?: string | null
  status?: number
  isCredit?: boolean
  date?: string | null
  dueDate?: string | null
  datePaid?: string | null
  internalNote?: string
  chapters?: { lines?: { id?: number; subTotal?: string | number }[] }[]
}

/** HTML-escape: notitietekst uit EVA mag de opmaak van de Bouw7-notitie niet kunnen breken. */
function escapeHtml(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Datum in de schrijfwijze die de administratie in Bouw7 zelf gebruikt: `1-9-26`. */
function korteDatum(d: Date): string {
  return `${d.getDate()}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(-2)}`
}

/**
 * Eén logboekregel als paragraaf in de huisstijl van de bestaande Bouw7-notities:
 * `**1-9-26**, Tom Kamminga (EVA)` met de tekst eronder.
 */
function maakNotitieParagraaf(tekst: string, auteur: string | null, op: Date): string {
  const regels = escapeHtml(tekst.trim()).split('\n').map(r => r.trim()).filter(Boolean)
  const kop = `<strong>${korteDatum(op)}</strong>, ${escapeHtml(auteur ?? 'EVA')} (EVA)`
  return `<p>${[kop, ...regels].join('<br>')}</p>`
}

/** Fiscale kern van het document — moet de write ongemoeid laten. */
function fiscaleKern(doc: Bouw7InvoiceDocument): string {
  const regels = (doc.chapters ?? []).flatMap(c => c.lines ?? [])
  const som = regels.reduce((t, r) => t + Number(r.subTotal ?? 0), 0)
  return JSON.stringify({
    id: doc.id ?? null,
    nr: doc.invoiceNumber ?? null,
    st: doc.status ?? null,
    cr: doc.isCredit ?? null,
    d: doc.date ?? null,
    dd: doc.dueDate ?? null,
    dp: doc.datePaid ?? null,
    n: regels.length,
    som: Math.round(som * 100),
  })
}

/**
 * Voeg één regel toe aan de interne notitie van een Bouw7-verkoopfactuur.
 *
 * @param bouw7InvoiceId  Bouw7-factuur-id (`debiteuren.bouw7_invoice_id`).
 * @param tekst           De op te nemen tekst (platte tekst, mag regeleindes bevatten).
 * @param auteur          Naam van de EVA-gebruiker, voor de kopregel.
 * @returns Bij succes ook de nieuwe volledige notitie als HTML, zodat de aanroeper de
 *          EVA-kopie kan bijwerken zonder op de volgende sync te wachten.
 */
export async function voegRegelToeAanInterneNotitie(
  bouw7InvoiceId: string,
  tekst: string,
  auteur: string | null,
): Promise<Bouw7WriteResult & { notitieHtml?: string }> {
  if (!tekst.trim()) return { ok: true }
  try {
    const client = await getBouw7Client()

    const huidig = await client.get<Bouw7InvoiceDocument>(`/invoice/${bouw7InvoiceId}`)
    if (huidig?.id == null || String(huidig.id) !== String(bouw7InvoiceId)) {
      return { ok: false, error: `Bouw7-factuur ${bouw7InvoiceId} niet gevonden.` }
    }

    // Nieuwste bovenaan, gescheiden door een <hr> — precies zoals de administratie de notitie
    // in Bouw7 zelf opbouwt. Een nieuwe regel onderaan plakken zou de leesvolgorde omkeren.
    const bestaand = (huidig.internalNote ?? '').trim()
    const nieuweNotitie = [maakNotitieParagraaf(tekst, auteur, new Date()), bestaand]
      .filter(Boolean)
      .join('<hr>')

    const voor = fiscaleKern(huidig)
    const na = await client.post<Bouw7InvoiceDocument>('/invoice', { ...huidig, internalNote: nieuweNotitie })

    // De POST geeft het bijgewerkte document terug; controleer daarop, dat scheelt een extra GET.
    if (na && fiscaleKern(na) !== voor) {
      return {
        ok: false,
        error: `Let op: de notitie is opgeslagen, maar Bouw7 gaf factuur ${huidig.invoiceNumber ?? bouw7InvoiceId} gewijzigd terug. Controleer de factuur in Bouw7.`,
      }
    }

    return { ok: true, notitieHtml: na?.internalNote ?? nieuweNotitie }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij het schrijven van de notitie naar Bouw7.' }
  }
}
