/**
 * Verzamelfacturen klaarzetten in Bouw7 — één conceptfactuur voor meerdere projecten.
 *
 * Bouw7 kent dit zelf (`InvoiceDocument.isCollective`). Zo ziet een verzamelfactuur van de
 * administratie eruit (factuur 4180592, Vidomes, mei 2026):
 *   - `isCollective: true`, `project: null`, het root-hoofdstuk leeg;
 *   - per project een eigen hoofdstuk, naam `"<projectnummer> <projectnaam>"`;
 *   - elke regel draagt zijn eigen `projectId`, en koppelt via `linkedBookingItems` de uren
 *     (`employeeHours`) en inkoopregels (`purchaseInvoiceLines`) die hij factureert.
 *
 * Hetzelfde read-modify-write-patroon als `maakConceptVerkoopfactuur`: een skelet van Bouw7 zelf
 * als basis, zodat status (concept), organisatie, vestiging en btw-instellingen niet geraden
 * hoeven te worden. Er is geen skelet "zonder project mét relatie" (`/contact/{id}/invoice/new`
 * bestaat niet), dus het skelet komt van een project op de factuur waarvan de debiteur de
 * factuurpartij is. Staat de factuurpartij op geen van de projecten (een VvE die via het
 * factuuradres betaalt), dan wordt alleen de relatie verwisseld — de adresvelden daarvan zijn in
 * de spec `readOnly` en vult Bouw7 zelf bij het opslaan.
 *
 * Niet fail-soft: elke afwijking van wat er gevraagd is, is een harde melding mét factuur-id.
 *
 * Valkuil: `/list/invoices?q=project.id = X` vindt een verzamelfactuur niet (project is null), en
 * `lines.projectId` is geen HQL-veld. Terugvinden gaat via `isCollective` + relatie.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import { bouw7RichTextNaarTekst } from '@/lib/bouw7/rich-text'
import {
  FACTUUR_STATUS_CONCEPT, factuurMarker, foutTekst,
  type InvoiceChapter, type InvoiceDocument, type InvoiceLine,
} from '@/lib/bouw7/verkoopfactuur'

type Koppeling = { id: number; type: string }

/** De velden van een verzamelfactuur die `InvoiceDocument` in `verkoopfactuur.ts` niet noemt. */
type VerzamelDocument = InvoiceDocument & {
  isCollective?: boolean
  workAddress?: string | null
  displayWorkAddress?: boolean
  isVatShifted?: boolean
  contact?: (InvoiceDocument['contact'] & Record<string, unknown>) | null
  contactPerson?: unknown
  contactPersonName?: string | null
  branch?: { id?: number } | null
}

export type VerzamelRegel = {
  omschrijving: string
  aantal: number
  eenheid?: string | null
  stukprijs: number
  vatTariffId: number
  /** Leeg = een losse regel binnen het hoofdstuk (zoals "Klein materiaal" bij de administratie). */
  projectId: number | null
  projectInvoiceTermIds?: number[]
  koppelingen?: Koppeling[]
  referentie?: string | null
}

export type VerzamelHoofdstuk = {
  projectId: number
  /** `"<projectnummer> <projectnaam>"`, zoals Bouw7 het zelf schrijft. */
  naam: string
  regels: VerzamelRegel[]
}

export type VerzamelInvoer = {
  /** Bouw7-contact van de factuurpartij. */
  contactId: number
  /** Bouw7-vestiging van de werkmaatschappij; elk project op de factuur moet daaronder vallen. */
  branchId: number
  hoofdstukken: VerzamelHoofdstuk[]
  /** Zichtbare omschrijving, al in Bouw7-opmaak. */
  omschrijving: string | null
  idempotentieSleutel: string
}

export type VerzamelResultaat =
  | { ok: true; invoiceId: number; totaalExclBtw: number; zonderKoppelingen: boolean }
  | { ok: false; error: string; invoiceId?: number }

const centen = (n: number): number => Math.round(n * 100)
const bedrag = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)

/** Zoekt een eerder klaargezette verzamelfactuur terug aan zijn marker (herstel na een timeout). */
export async function vindVerzamelConcept(contactId: number, sleutel: string): Promise<number | null> {
  try {
    const client = await getBouw7Client()
    const res = await client.get<{ items?: { id: number; note?: string | null }[] }>('/list/invoices', {
      q: `isCollective = true AND contact.id = ${contactId} SORT(id, DESC) LIMIT 50`,
    })
    const m = factuurMarker(sleutel)
    return (res.items ?? []).find(i => (i.note ?? '').includes(m))?.id ?? null
  } catch {
    return null
  }
}

/**
 * Hoe staat een factuur er in Bouw7 voor? `weg` alleen bij een expliciete 404 — bij een storing
 * blijft alles zoals het was, want onterecht "verwijderd" geeft boekingen vrij die wél gefactureerd
 * zijn.
 */
export async function leesFactuurStand(
  invoiceId: number,
): Promise<{ stand: 'weg' } | { stand: 'bestaat'; factuurnummer: string | null; status: number | null } | { stand: 'onbekend'; error: string }> {
  try {
    const client = await getBouw7Client()
    const doc = await client.get<InvoiceDocument>(`/invoice/${invoiceId}`)
    return { stand: 'bestaat', factuurnummer: doc?.invoiceNumber ?? null, status: doc?.status ?? null }
  } catch (e) {
    const tekst = foutTekst(e)
    if (tekst.includes('(404)') && tekst.includes('entity_not_found')) return { stand: 'weg' }
    return { stand: 'onbekend', error: tekst }
  }
}

/** Het InvoiceContact van een andere relatie, in de vorm van het skelet. Adresvelden zijn readOnly. */
async function contactVoorFactuur(
  contactId: number,
  vorm: Record<string, unknown>,
): Promise<{ contact: Record<string, unknown>; isVatShifted: boolean; velden: Record<string, unknown> } | null> {
  const client = await getBouw7Client()
  const c = await client.get<Record<string, unknown>>(`/contact/${contactId}`)
  if (c?.id == null) return null
  const leeg = Object.fromEntries(Object.keys(vorm).map(k => [k, null]))
  const contact = {
    ...leeg,
    id: contactId,
    name: c.name ?? null,
    nAccountText: c.nAccountText ?? null,
    gAccountText: c.gAccountText ?? null,
    glnNumber: c.glnNumber ?? null,
    isVatShifted: c.isVatShifted ?? false,
    customAttributeValues: [],
    contactDivisions: [],
  }
  // Op factuurniveau staan dezelfde btw- en g-rekeninginstellingen nog een keer; die zijn wél
  // schrijfbaar en volgen in de Bouw7-UI de gekozen relatie.
  const velden: Record<string, unknown> = { isVatShifted: !!c.isVatShifted }
  if (c.wageComponentPercentage != null) velden.wageComponentPercentage = String(c.wageComponentPercentage)
  if (c.gAccountPercentage != null) velden.gAccountPercentage = String(c.gAccountPercentage)
  if (c.gAccountText != null) velden.gAccountText = c.gAccountText
  if (c.nAccountText != null) velden.nAccountText = c.nAccountText
  return { contact, isVatShifted: !!c.isVatShifted, velden }
}

/** Zet één verzamelfactuur als concept klaar in Bouw7. */
export async function maakConceptVerzamelfactuur(invoer: VerzamelInvoer): Promise<VerzamelResultaat> {
  const hoofdstukken = invoer.hoofdstukken.filter(h => h.regels.length > 0)
  if (hoofdstukken.length === 0) return { ok: false, error: 'Geen regels om te factureren.' }

  const client = await getBouw7Client()

  const bestaand = await vindVerzamelConcept(invoer.contactId, invoer.idempotentieSleutel)
  if (bestaand != null) {
    return {
      ok: false,
      invoiceId: bestaand,
      error: `Er staat al een verzamelfactuur voor deze selectie klaar in Bouw7 (factuur ${bestaand}). `
        + 'Controleer hem daar; EVA maakt er geen tweede.',
    }
  }

  // 1. Skeletten per project: daarmee is ook te controleren dat elk project onder dezelfde
  //    vestiging valt. Eén vreemde ertussen en de factuur komt in de verkeerde administratie.
  const skeletten: { projectId: number; doc: VerzamelDocument }[] = []
  for (const h of hoofdstukken) {
    try {
      skeletten.push({ projectId: h.projectId, doc: await client.get<VerzamelDocument>(`/project/${h.projectId}/invoice/new`) })
    } catch (e) {
      return { ok: false, error: `Bouw7 gaf geen leeg factuurdocument voor project ${h.projectId}: ${foutTekst(e)}` }
    }
  }
  const andereVestiging = skeletten.filter(s => s.doc.branch?.id !== invoer.branchId)
  if (andereVestiging.length > 0) {
    const namen = andereVestiging.map(s => hoofdstukken.find(h => h.projectId === s.projectId)?.naam ?? s.projectId)
    return {
      ok: false,
      error: `Deze bon${andereVestiging.length === 1 ? ' valt' : 'nen vallen'} in Bouw7 onder een andere werkmaatschappij: `
        + `${namen.join(', ')}. Er is niets klaargezet.`,
    }
  }
  if (skeletten.some(s => s.doc.status !== FACTUUR_STATUS_CONCEPT)) {
    return { ok: false, error: 'Bouw7 opent een nieuwe factuur niet als concept. EVA zet niets klaar zolang dat niet klopt.' }
  }

  // 2. Basis: het skelet van een project met de factuurpartij als debiteur, anders het eerste.
  const eigen = skeletten.find(s => s.doc.contact?.id === invoer.contactId)
  const basis = (eigen ?? skeletten[0]).doc
  let contactDeel: Partial<VerzamelDocument> = {}
  if (!eigen) {
    let andere: Awaited<ReturnType<typeof contactVoorFactuur>>
    try {
      andere = await contactVoorFactuur(invoer.contactId, (basis.contact ?? {}) as Record<string, unknown>)
    } catch (e) {
      return { ok: false, error: `De factuurpartij is niet op te halen uit Bouw7: ${foutTekst(e)}` }
    }
    if (!andere) return { ok: false, error: `Relatie ${invoer.contactId} bestaat niet in Bouw7.` }
    contactDeel = { ...andere.velden, contact: andere.contact as VerzamelDocument['contact'] }
  }

  // 3. Eén hoofdstuk per project, zoals de administratie het zelf doet.
  const root: InvoiceChapter = { ...(basis.chapters?.[0] ?? {}), sortIndex: 0, isRoot: true, name: 'Root', lines: [] }
  const metKoppelingen = (mee: boolean): InvoiceChapter[] => hoofdstukken.map((h, i) => ({
    id: null,
    sortIndex: i + 1,
    isRoot: false,
    name: h.naam.slice(0, 255),
    lines: h.regels.map((r, j): InvoiceLine => ({
      sortIndex: j,
      description: r.omschrijving.slice(0, 255),
      quantity: String(r.aantal),
      unitName: r.eenheid ?? null,
      unitPrice: bedrag(r.stukprijs),
      subTotal: bedrag(r.aantal * r.stukprijs),
      surchargePercentage: '0',
      vatTariffId: r.vatTariffId,
      projectInvoiceTermIds: r.projectInvoiceTermIds ?? [],
      linkedBookingItems: mee ? (r.koppelingen ?? []) : [],
      projectId: r.projectId,
      reference: r.referentie ?? null,
      ledger: null,
      costCenter: null,
    })),
  }))
  const verwachtCenten = hoofdstukken.reduce((s, h) =>
    s + h.regels.reduce((t, r) => t + centen(Number(bedrag(r.aantal * r.stukprijs))), 0), 0)
  const verwachtRegels = hoofdstukken.reduce((s, h) => s + h.regels.length, 0)

  const body = (mee: boolean): VerzamelDocument => ({
    ...basis,
    ...contactDeel,
    id: null,
    isCollective: true,
    project: null,
    // Een werkadres en contactpersoon horen bij één project; op een verzamelfactuur staat dat per
    // hoofdstuk. De administratie laat deze velden zelf ook leeg.
    workAddress: '',
    contactPerson: null,
    contactPersonName: null,
    description: invoer.omschrijving ?? '',
    internalNote: factuurMarker(invoer.idempotentieSleutel),
    chapters: [root, ...metKoppelingen(mee)],
  })

  // 4. Aanmaken. Een gekoppeld uur of inkoopregel die in Bouw7 al op een andere factuur staat kan
  //    de hele factuur laten weigeren; dan één keer zonder koppelingen. Een 4xx is niet aangemaakt,
  //    en de marker vangt het geval waarin het antwoord verloren ging.
  const heeftKoppelingen = hoofdstukken.some(h => h.regels.some(r => (r.koppelingen ?? []).length > 0))
  let doc: VerzamelDocument
  let zonderKoppelingen = false
  try {
    doc = await client.post<VerzamelDocument>('/invoice', body(true))
  } catch (eerste) {
    const herstel = await vindVerzamelConcept(invoer.contactId, invoer.idempotentieSleutel)
    if (herstel != null) {
      return {
        ok: false,
        invoiceId: herstel,
        error: `Bouw7 gaf een fout terug, maar verzamelfactuur ${herstel} is wél aangemaakt. `
          + 'Controleer hem in Bouw7 voordat je het opnieuw probeert.',
      }
    }
    const tekst = foutTekst(eerste)
    if (!heeftKoppelingen || !/\(4\d\d\)/.test(tekst)) {
      return { ok: false, error: `Bouw7 weigerde de verzamelfactuur: ${tekst}` }
    }
    try {
      doc = await client.post<VerzamelDocument>('/invoice', body(false))
      zonderKoppelingen = true
    } catch (tweede) {
      return { ok: false, error: `Bouw7 weigerde de verzamelfactuur: ${tekst} — en ook zonder koppelingen: ${foutTekst(tweede)}` }
    }
  }

  // 5. Acceptatiecriteria.
  const id = doc?.id
  if (id == null) return { ok: false, error: 'Bouw7 gaf geen factuur-id terug.' }

  const bezwaren: string[] = []
  if (doc.status !== FACTUUR_STATUS_CONCEPT) bezwaren.push(`status ${doc.status} in plaats van concept`)
  if (doc.invoiceNumber) bezwaren.push(`er is al een factuurnummer toegekend (${doc.invoiceNumber})`)
  if (doc.isMailed) bezwaren.push('de factuur staat als verzonden')
  if (doc.isBooked) bezwaren.push('de factuur staat als geboekt')
  if (doc.isCollective !== true) bezwaren.push('Bouw7 heeft er geen verzamelfactuur van gemaakt')
  if (doc.project != null) bezwaren.push(`de factuur hangt toch aan project ${doc.project.id}`)
  if (doc.contact?.id !== invoer.contactId) bezwaren.push(`de factuur staat op relatie ${doc.contact?.id} in plaats van ${invoer.contactId}`)
  const terug = (doc.chapters ?? []).flatMap(c => c.lines ?? [])
  if (terug.length !== verwachtRegels) bezwaren.push(`${terug.length} regels terug in plaats van ${verwachtRegels}`)
  const terugCenten = terug.reduce((s, l) => s + centen(Number(l.subTotal ?? 0)), 0)
  if (terugCenten !== verwachtCenten) {
    bezwaren.push(`bedrag € ${(terugCenten / 100).toFixed(2)} in plaats van € ${(verwachtCenten / 100).toFixed(2)}`)
  }
  const verwachteProjecten = new Set(hoofdstukken.map(h => h.projectId))
  const terugProjecten = new Set(terug.map(l => l.projectId).filter((p): p is number => p != null))
  for (const p of verwachteProjecten) {
    if (!terugProjecten.has(p) && hoofdstukken.find(h => h.projectId === p)?.regels.some(r => r.projectId != null)) {
      bezwaren.push(`project ${p} staat niet op de factuur`)
    }
  }
  const verstuurdeTekst = bouw7RichTextNaarTekst(invoer.omschrijving ?? '')
  if (verstuurdeTekst && bouw7RichTextNaarTekst(doc.description ?? '') !== verstuurdeTekst) {
    bezwaren.push('de omschrijving is niet goed overgekomen')
  }

  if (bezwaren.length > 0) {
    return {
      ok: false,
      invoiceId: id,
      error: `De verzamelfactuur is aangemaakt in Bouw7 (nummer ${id}), maar wijkt af: ${bezwaren.join('; ')}. `
        + 'Controleer hem daar voordat er iets verzonden wordt.',
    }
  }

  return { ok: true, invoiceId: id, totaalExclBtw: verwachtCenten / 100, zonderKoppelingen }
}
