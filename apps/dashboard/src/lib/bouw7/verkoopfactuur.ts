/**
 * Conceptfacturen klaarzetten in Bouw7.
 *
 * EVA maakt facturen **klaar**, het verzendt ze niet. Een conceptfactuur heeft in Bouw7 nog geen
 * factuurnummer; dat kent Bouw7 pas toe bij verzenden. Zo blijft de fiscale nummering waar hij
 * hoort — bij de administratie — terwijl EVA wel al alle regels aanlevert.
 *
 * Mechaniek (zie WRITE-ENDPOINTS.md §7b), hetzelfde read-modify-write-patroon als `invoice-note.ts`:
 *   1. `GET /project/{projectId}/invoice/new` geeft een compleet, leeg `InvoiceDocument` terug —
 *      hetzelfde skelet dat de Bouw7-UI gebruikt, met `status: 3` (Concept), `id: null`,
 *      `invoiceNumber: null` en organisatie/relatie/vestiging al ingevuld door Bouw7 zelf.
 *   2. Alleen `chapters[0].lines[]` vullen (plus datum/omschrijving/notitie).
 *   3. `POST /invoice` — upsert; zonder `id` is dat een create.
 *   4. Het teruggegeven document toetsen aan harde acceptatiecriteria.
 *
 * Waarom niet zelf een body opbouwen: dat is precies waar de vorige poging op stukliep. Een
 * `InvoiceDocument` heeft `chapters[].lines[]` (geen platte `lines`), en zonder `status` in de body
 * kan Bouw7 terugvallen op 0 (Open) — dan staat er een openstaande factuur mét nummer. Door het
 * skelet als basis te nemen hoeft geen enkel veld geraden te worden.
 *
 * Anders dan `invoice-note.ts` is dit **niet** fail-soft. Een mislukte notitie kost hooguit een
 * spiegeling; een half geslaagde factuur-create kan een echt document achterlaten. Elke afwijking
 * van de acceptatiecriteria is daarom een harde, zichtbare melding — met het factuur-id erbij,
 * zodat de gebruiker in Bouw7 kan gaan kijken in plaats van blind opnieuw te proberen.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'

/** Bouw7-factuurstatus. Vaste enum, er is geen `/invoice/statuses`-endpoint (404). */
export const FACTUUR_STATUS_CONCEPT = 3

/** Het deel van `InvoiceDocument` dat we lezen of zetten. De rest gaat ongezien mee. */
type InvoiceDocument = {
  id?: number | null
  invoiceNumber?: string | null
  status?: number
  isCredit?: boolean
  isMailed?: boolean
  isBooked?: boolean
  date?: string | null
  dueDate?: string | null
  description?: string
  internalNote?: string
  project?: { id?: number } | null
  contact?: { id?: number; name?: string } | null
  chapters?: InvoiceChapter[]
}
type InvoiceChapter = {
  id?: number | null
  sortIndex?: number
  isRoot?: boolean
  name?: string
  lines?: InvoiceLine[]
}
type InvoiceLine = {
  id?: number | null
  sortIndex: number
  description: string
  quantity: string
  unitName?: string | null
  unitPrice: string
  subTotal: string
  surchargePercentage?: string
  vatTariffId: number
  /** De koppeling met verkooptermijnen. Bouw7 vult daarna zelf `invoiceLine` op de termijn. */
  projectInvoiceTermIds?: number[]
  linkedBookingItems?: unknown[]
  projectId?: number | null
  ledger?: unknown
  costCenter?: unknown
}

/** Eén regel zoals EVA hem aanlevert. Bedragen in euro's; de omrekening naar Bouw7 gebeurt hier. */
export type ConceptFactuurRegel = {
  omschrijving: string
  aantal: number
  eenheid?: string | null
  stukprijs: number
  /** Btw-tarief-id uit Bouw7 (`btw_tarieven.bouw7_id`), niet een percentage. */
  vatTariffId: number
  /** Termijn-id's die deze regel afdekt. Houd het bij één per regel; zie §7b. */
  projectInvoiceTermIds?: number[]
}

export type ConceptFactuurInvoer = {
  projectId: number
  regels: ConceptFactuurRegel[]
  /** Zichtbare omschrijving op de factuur. */
  omschrijving?: string | null
  /** Interne notitie; de idempotentiemarker wordt hier onderaan bij geplakt. */
  interneNotitie?: string | null
  /**
   * Unieke sleutel voor deze factuurpoging. Wordt als onzichtbare marker in de interne notitie
   * gezet, zodat een afgebroken poging teruggevonden kan worden in plaats van herhaald.
   */
  idempotentieSleutel: string
}

export type FactuurResultaat =
  | { ok: true; invoiceId: number; totaalExclBtw: number }
  | { ok: false; error: string; invoiceId?: number }

const centen = (n: number): number => Math.round(n * 100)
const bedrag = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)

/** Marker in de interne notitie waarmee een afgebroken poging terug te vinden is. */
function marker(sleutel: string): string {
  return `<!-- EVA-factuur:${sleutel} -->`
}

/**
 * Zoekt een eerder klaargezette conceptfactuur terug aan zijn marker. Het herstelpad na een
 * timeout: zonder deze controle is "geen antwoord gekregen" niet te onderscheiden van "niet
 * aangemaakt", en dat verschil is precies het risico op een dubbele factuur.
 */
export async function vindConceptMetSleutel(
  projectId: number,
  sleutel: string,
): Promise<number | null> {
  try {
    const client = await getBouw7Client()
    const res = await client.get<{ items?: { id: number; note?: string | null }[] }>('/list/invoices', {
      q: `project.id = ${projectId} SORT(id, DESC) LIMIT 50`,
    })
    const m = marker(sleutel)
    const gevonden = (res.items ?? []).find(i => (i.note ?? '').includes(m))
    return gevonden?.id ?? null
  } catch {
    return null
  }
}

/**
 * Zet één conceptfactuur klaar in Bouw7.
 *
 * Meerdere regels op één factuur is precies wat Bouw7 zelf doet bij een termijnstaat: één regel per
 * termijn, elk met zijn eigen `projectInvoiceTermIds`.
 */
export async function maakConceptVerkoopfactuur(
  invoer: ConceptFactuurInvoer,
): Promise<FactuurResultaat> {
  if (invoer.regels.length === 0) return { ok: false, error: 'Geen regels om te factureren.' }

  const client = await getBouw7Client()

  // Herstelpad: bestaat er al een factuur met deze sleutel, dan is een eerdere poging wél
  // aangekomen. Nooit een tweede maken.
  const bestaand = await vindConceptMetSleutel(invoer.projectId, invoer.idempotentieSleutel)
  if (bestaand != null) {
    return {
      ok: false,
      invoiceId: bestaand,
      error: `Er staat al een conceptfactuur voor deze selectie klaar in Bouw7 (factuur ${bestaand}). `
        + 'Controleer hem daar; EVA maakt er geen tweede.',
    }
  }

  // 1. Skelet ophalen — hierin staat status 3 (Concept) en de hele koptekst al ingevuld.
  let skelet: InvoiceDocument
  try {
    skelet = await client.get<InvoiceDocument>(`/project/${invoer.projectId}/invoice/new`)
  } catch (e) {
    return { ok: false, error: `Bouw7 gaf geen leeg factuurdocument terug: ${foutTekst(e)}` }
  }
  if (skelet?.contact?.id == null) {
    return { ok: false, error: 'Dit Bouw7-project heeft geen debiteur; koppel eerst een relatie in Bouw7.' }
  }
  if (skelet.status !== FACTUUR_STATUS_CONCEPT) {
    return {
      ok: false,
      error: `Bouw7 opent een nieuwe factuur niet als concept (status ${skelet.status}). `
        + 'EVA zet niets klaar zolang dat niet klopt.',
    }
  }

  // 2. Regels in de root-chapter zetten die Bouw7 zelf meelevert.
  const root: InvoiceChapter = skelet.chapters?.[0] ?? { sortIndex: 0, isRoot: true, name: 'Root' }
  const lines: InvoiceLine[] = invoer.regels.map((r, i) => ({
    sortIndex: i,
    description: r.omschrijving,
    quantity: String(r.aantal),
    unitName: r.eenheid ?? null,
    unitPrice: bedrag(r.stukprijs),
    subTotal: bedrag(r.aantal * r.stukprijs),
    surchargePercentage: '0',
    vatTariffId: r.vatTariffId,
    projectInvoiceTermIds: r.projectInvoiceTermIds ?? [],
    linkedBookingItems: [],
    projectId: null,
    ledger: null,
    costCenter: null,
  }))
  const verwachtCenten = lines.reduce((s, l) => s + centen(Number(l.subTotal)), 0)

  const notitie = [invoer.interneNotitie?.trim(), marker(invoer.idempotentieSleutel)]
    .filter(Boolean).join('\n')

  const body: InvoiceDocument = {
    ...skelet,
    description: invoer.omschrijving ?? skelet.description ?? '',
    internalNote: notitie,
    chapters: [{ ...root, lines }],
  }

  // 3. Aanmaken.
  let doc: InvoiceDocument
  try {
    doc = await client.post<InvoiceDocument>('/invoice', body)
  } catch (e) {
    // Een mislukte call kan tóch zijn aangekomen. Kijk of de marker inmiddels bestaat.
    const herstel = await vindConceptMetSleutel(invoer.projectId, invoer.idempotentieSleutel)
    if (herstel != null) {
      return {
        ok: false,
        invoiceId: herstel,
        error: `Bouw7 gaf een fout terug, maar de conceptfactuur ${herstel} is wél aangemaakt. `
          + 'Controleer hem in Bouw7 voordat je het opnieuw probeert.',
      }
    }
    return { ok: false, error: `Bouw7 weigerde de conceptfactuur: ${foutTekst(e)}` }
  }

  // 4. Acceptatiecriteria. Op een factuur mag niets stil blijven.
  const id = doc?.id
  if (id == null) return { ok: false, error: 'Bouw7 gaf geen factuur-id terug.' }

  const bezwaren: string[] = []
  if (doc.status !== FACTUUR_STATUS_CONCEPT) bezwaren.push(`status ${doc.status} in plaats van concept`)
  if (doc.invoiceNumber) bezwaren.push(`er is al een factuurnummer toegekend (${doc.invoiceNumber})`)
  if (doc.isMailed) bezwaren.push('de factuur staat als verzonden')
  if (doc.isBooked) bezwaren.push('de factuur staat als geboekt')
  const terug = (doc.chapters ?? []).flatMap(c => c.lines ?? [])
  if (terug.length !== lines.length) bezwaren.push(`${terug.length} regels terug in plaats van ${lines.length}`)
  const terugCenten = terug.reduce((s, l) => s + centen(Number(l.subTotal ?? 0)), 0)
  if (terugCenten !== verwachtCenten) {
    bezwaren.push(`bedrag € ${(terugCenten / 100).toFixed(2)} in plaats van € ${(verwachtCenten / 100).toFixed(2)}`)
  }

  if (bezwaren.length > 0) {
    return {
      ok: false,
      invoiceId: id,
      error: `De conceptfactuur is aangemaakt in Bouw7 (nummer ${id}), maar wijkt af: ${bezwaren.join('; ')}. `
        + 'Controleer hem daar voordat er iets verzonden wordt.',
    }
  }

  return { ok: true, invoiceId: id, totaalExclBtw: verwachtCenten / 100 }
}

/**
 * Verwijdert een conceptfactuur. Bewust alleen toegestaan zolang er geen factuurnummer is: een
 * genummerde factuur is een fiscaal document en gaat via een creditnota, niet via delete.
 */
export async function verwijderConceptFactuur(
  invoiceId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = await getBouw7Client()
    const doc = await client.get<InvoiceDocument>(`/invoice/${invoiceId}`)
    if (doc?.invoiceNumber) {
      return { ok: false, error: `Factuur ${doc.invoiceNumber} heeft een factuurnummer en is niet te verwijderen; corrigeer met een creditnota.` }
    }
    if (doc?.status !== FACTUUR_STATUS_CONCEPT) {
      return { ok: false, error: `Factuur ${invoiceId} staat niet als concept en is niet te verwijderen.` }
    }
    // Pad-vorm, zoals de write-catalogus hem noemt: `DELETE /invoice/{invoice}`.
    await client.del(`/invoice/${invoiceId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: foutTekst(e) }
  }
}

function foutTekst(e: unknown): string {
  return e instanceof Error ? e.message : 'onbekende fout'
}
