/**
 * Registry van Bouw7-leesbronnen die EVA als snapshot bewaart.
 *
 * WAAROM PER BRON EN NIET PER SCHERM — de schermwrappers (`getDossierBewaking`,
 * `getDossierInkoop`, `resolveBewakingscodes`, …) putten uit dezelfde endpoints. De Apollo-
 * inkoopfacturen zitten in drie wrappers, de zes Athena-kostensoorten in vier. Zou elk scherm zijn
 * eigen snapshot krijgen, dan haalden we die endpoints per dossier drie- tot viermaal op. Per bron
 * bewaren scheelt ruwweg de helft van het cron-werk, én het houdt de EVA-eigen overlays
 * (inkoopcorrecties, voortgang, regieregels) live: die staan niet in de snapshot en worden dus
 * nooit oud.
 *
 * De loaders hieronder zijn letterlijk de calls die eerder in de wrappers stonden. De verwerking
 * is bewust níét meeverhuisd: die blijft in de wrapper, zodat een rekenregel wijzigen geen nieuwe
 * snapshot vereist en een bestaande snapshot bruikbaar blijft.
 */
import 'server-only'

import type {
  Bouw7Client,
  Bouw7ContractOrderLine,
  Bouw7ControlResponse,
  Bouw7CostTypeId,
  Bouw7EmployeeHourLog,
  Bouw7EmployeeHourLogResponse,
  Bouw7ListResponse,
  Bouw7ProjectFinancial,
  Bouw7ProjectFile,
  Bouw7ProjectInvoiceTerm,
  Bouw7ProjectInvoiceTermStatement,
  Bouw7PurchaseInvoice,
  Bouw7PurchaseInvoiceListResponse,
  Bouw7PurchaseOrderContract,
  Bouw7SalesInvoice,
  Bouw7SubcontractorContract,
} from './client'

/* ── Soorten ──────────────────────────────────────────────────────── */

// De namen van de bronnen staan in `snapshot-soorten.ts` — dat bestand is niet `server-only`,
// zodat de Vernieuwen-knop in de browser ze mag gebruiken zonder deze loaders mee te trekken.
export type { DossierSoort, GlobaleSoort, SnapshotTab } from './snapshot-soorten'
export {
  ALLE_DOSSIER_SOORTEN,
  SOORTEN_PER_TAB,
  WARM_SET,
  WARM_SET_AFGESLOTEN,
} from './snapshot-soorten'

import type { DossierSoort, GlobaleSoort } from './snapshot-soorten'

/** Kostensoorten waarover de projectbewaking wordt opgehaald (1 Arbeid t/m 6 Afval). */
export const BEWAKING_KOSTENSOORTEN: Bouw7CostTypeId[] = [1, 2, 3, 4, 5, 6]

/* ── Payload-vormen ───────────────────────────────────────────────── */

/** Per kostensoort de control-respons; `null` als juist díé kostensoort faalde. */
export type AthenaControlPayload = Partial<Record<Bouw7CostTypeId, Bouw7ControlResponse | null>>
export type ContractOrderLinesPayload = { items: Bouw7ContractOrderLine[]; total: number }
export type TermijnenPayload = {
  statements: Bouw7ProjectInvoiceTermStatement[]
  termijnen: Bouw7ProjectInvoiceTerm[]
}
export type HourLogsPayload = {
  items: Bouw7EmployeeHourLog[]
  totalHours: number | null
  totalCost: number | null
}
export type UrenVensterPayload = { van: string; tot: string; items: Bouw7EmployeeHourLog[] }

const getal = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isNaN(n) ? 0 : n
}

/* ── Loaders per dossierbron ──────────────────────────────────────── */

/**
 * `vorige` leest de payload die er nu staat (of `null`). Alleen een bron die daar iets aan heeft
 * roept hem aan — voor de rest kost hij niets.
 */
export type DossierLoader = (
  client: Bouw7Client,
  bouw7Id: string,
  vorige: () => Promise<unknown>,
) => Promise<unknown>

/**
 * Eén regel van een verkoopfactuur, zoals EVA hem bewaart. De lijst (`/list/invoices`) kent geen
 * regels en geen omschrijving; die staan alleen in het document (`/invoice/{id}`).
 */
export type VerkoopfactuurRegelSnap = {
  omschrijving: string
  subTotal: number
  btwPct: number | null
  termIds: number[]
}
/** Een lijstitem met de regels uit het document erbij. `evaRegels: null` = document niet gelezen. */
export type VerkoopfactuurSnap = Bouw7SalesInvoice & {
  evaOmschrijving?: string | null
  evaRegels?: VerkoopfactuurRegelSnap[] | null
}

/** Bouw7 levert omschrijvingen soms als rich text; op het scherm hoort platte tekst. */
const plat = (s: unknown): string =>
  typeof s === 'string'
    ? s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    : ''

type FactuurDocument = {
  description?: string | null
  chapters?: {
    lines?: {
      description?: string | null
      subTotal?: string | number
      vatTariffPercentage?: string | number | null
      projectInvoiceTermIds?: number[] | null
    }[]
  }[]
}

async function leesFactuurRegels(
  client: Bouw7Client,
  id: number,
): Promise<{ omschrijving: string | null; regels: VerkoopfactuurRegelSnap[] } | null> {
  try {
    const doc = await client.get<FactuurDocument>(`/invoice/${id}`)
    const regels = (doc.chapters ?? []).flatMap((c) => c.lines ?? []).map((l) => ({
      omschrijving: plat(l.description),
      subTotal: getal(l.subTotal),
      btwPct: l.vatTariffPercentage != null && l.vatTariffPercentage !== '' ? getal(l.vatTariffPercentage) : null,
      termIds: l.projectInvoiceTermIds ?? [],
    }))
    return { omschrijving: plat(doc.description) || null, regels }
  } catch {
    // Eén onleesbaar document mag de factuurlijst niet laten mislukken; de regel toont dan
    // gewoon geen omschrijving.
    return null
  }
}

export const DOSSIER_BRONNEN: Record<DossierSoort, DossierLoader> = {
  athena_financial: (client, id) =>
    client.getAthena<Bouw7ProjectFinancial>(`/project-financial/${id}`),

  // Zes calls in één bron. De `.catch(() => null)` per kostensoort stond al in de wrapper:
  // een enkele 404 (kostensoort niet in gebruik) mag de hele bewaking niet leegtrekken.
  athena_control: async (client, id) => {
    const responses = await Promise.all(
      BEWAKING_KOSTENSOORTEN.map((ct) =>
        client
          .getAthena<Bouw7ControlResponse>(
            `/project-control/${id}/cost-type/${ct}/chapters?include_subprojects=false`,
          )
          .catch(() => null),
      ),
    )
    // Alles gefaald = Bouw7 plat. Dan liever geen snapshot dan een lege stand die straks als
    // "dit project heeft geen bewakingscodes" op het scherm komt.
    if (responses.every((r) => r == null)) throw new Error('Alle kostensoorten faalden')

    const payload: AthenaControlPayload = {}
    BEWAKING_KOSTENSOORTEN.forEach((ct, i) => { payload[ct] = responses[i] })
    return payload
  },

  apollo_inkoopfacturen: (client, id) =>
    client.getApolloAll<Bouw7PurchaseInvoice>('/search/purchase-invoices', `project.id = ${id}`),

  // `total` is het gezaghebbende projecttotaal (ook boven de LIMIT) en wordt apart bewaard.
  contract_order_lines: async (client, id): Promise<ContractOrderLinesPayload> => {
    const r = await client.get<{ items?: Bouw7ContractOrderLine[]; total?: number | string }>(
      '/list/contract-order-lines',
      { q: `project.id = ${id} SORT(description, ASC) LIMIT 1000` },
    )
    return { items: r.items ?? [], total: getal(r.total) }
  },

  inkooporders: (client, id) =>
    client.get<Bouw7ListResponse<Bouw7PurchaseOrderContract>>('/list/purchase-order-contracts', {
      q: `project.id = ${id} LIMIT 500`,
    }),

  oa_contracten: (client, id) =>
    client.get<Bouw7ListResponse<Bouw7SubcontractorContract>>('/list/subcontractor-contracts', {
      q: `project.id = ${id} LIMIT 500`,
    }),

  heimdall_inkoopfacturen: (client, id) =>
    client.get<Bouw7PurchaseInvoiceListResponse>('/list/purchase-invoices', {
      q: `project.id = ${id} LIMIT 1000`,
    }),

  hour_logs: async (client, id): Promise<HourLogsPayload> => {
    const resp = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
      q: `project.id = ${id} SORT(logDate, DESC) LIMIT 2000`,
    })
    const items = resp.items ?? []
    // Uursoorten liften mee op deze call (Bouw7 is daarvoor leidend). Dit hoort hier en niet
    // meer in de schermwrapper: het is een schrijfactie, en die deed elke tab-opening opnieuw.
    if (items.length > 0) {
      try {
        const { deriveUursoorten } = await import('./derive-stamdata')
        await deriveUursoorten(items)
      } catch { /* afleiding mag het ophalen nooit laten mislukken */ }
    }
    return {
      items,
      totalHours: resp.totalHours != null ? getal(resp.totalHours) : null,
      totalCost: resp.totalCost != null ? getal(resp.totalCost) : null,
    }
  },

  // De lijst plus per factuur de regels uit het document. Een factuur waarvan `updatedAt` niet
  // veranderd is neemt zijn regels over uit de vorige stand: een verzonden factuur verandert niet,
  // dus zonder die hergebruik zou elke cronronde elk document opnieuw ophalen.
  verkoopfacturen: async (client, id, vorige) => {
    const lijst = await client.get<Bouw7ListResponse<Bouw7SalesInvoice>>('/list/invoices', {
      q: `project.id = ${id} SORT(date, DESC) LIMIT 500`,
    })
    const oud = new Map<number, VerkoopfactuurSnap>()
    try {
      const v = (await vorige()) as Bouw7ListResponse<VerkoopfactuurSnap> | null
      for (const f of v?.items ?? []) if (f.id != null) oud.set(f.id, f)
    } catch { /* geen vorige stand — alles vers ophalen */ }

    const items = lijst.items ?? []
    const verrijkt: VerkoopfactuurSnap[] = new Array(items.length)
    let volgende = 0
    const werker = async () => {
      for (;;) {
        const i = volgende++
        if (i >= items.length) return
        const f = items[i]
        const o = oud.get(f.id)
        if (o && o.evaRegels != null && (o as { updatedAt?: unknown }).updatedAt === (f as { updatedAt?: unknown }).updatedAt) {
          verrijkt[i] = { ...f, evaOmschrijving: o.evaOmschrijving ?? null, evaRegels: o.evaRegels }
          continue
        }
        const doc = await leesFactuurRegels(client, f.id)
        verrijkt[i] = { ...f, evaOmschrijving: doc?.omschrijving ?? null, evaRegels: doc?.regels ?? null }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, werker))
    return { ...lijst, items: verrijkt }
  },

  // Twee trappen: `statement.project.id` is niet HQL-mapped (400), dus eerst de termijnstaten
  // van het project, dan de losse termijnen per statement.
  termijnen: async (client, id): Promise<TermijnenPayload> => {
    const stmtResp = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTermStatement>>(
      '/list/project-invoice-term-statements',
      { q: `project.id = ${id} LIMIT 200` },
    )
    const statements = stmtResp.items ?? []
    const termijnen: Bouw7ProjectInvoiceTerm[] = []
    for (const s of statements) {
      if (s.id == null) continue
      const termResp = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>(
        '/list/project-invoice-terms',
        { q: `statement.id = ${s.id} LIMIT 500` },
      )
      termijnen.push(...(termResp.items ?? []))
    }
    return { statements, termijnen }
  },

  project_files: (client, id) =>
    client.get<{ items?: Bouw7ProjectFile[] }>('/list/project-files', {
      q: `project.id = ${id} LIMIT 500`,
    }),

  security_links: (client, id) =>
    client.get<unknown>(`/project/${id}/project-security-links`),
}

/* ── Globale bronnen ──────────────────────────────────────────────── */

/**
 * Het uren-venster dat `/uren` en `/wagenpark/werktijden` bedienen: vanaf 1 januari van het
 * lopende jaar, maar altijd minstens dertien weken terug — anders is het venster begin januari
 * zo goed als leeg. Periodes daarbuiten haalt de gebruiker desgewenst los op.
 */
export function urenVenster(nu: Date = new Date()): { van: string; tot: string } {
  const isoDag = (d: Date) => d.toISOString().slice(0, 10)
  const jaarStart = new Date(Date.UTC(nu.getUTCFullYear(), 0, 1))
  const dertienWeken = new Date(nu.getTime() - 13 * 7 * 86_400_000)
  return { van: isoDag(jaarStart < dertienWeken ? jaarStart : dertienWeken), tot: isoDag(nu) }
}

/**
 * Alleen de velden die `/uren` en de werktijdenanalyse gebruiken. Dit is de enige bron die we
 * trimmen: hij beslaat het hele bedrijf over maanden en zou ongetrimd veruit de grootste payload
 * zijn.
 */
function trimUurregel(h: Bouw7EmployeeHourLog): Bouw7EmployeeHourLog {
  return {
    id: h.id,
    employee: h.employee
      ? { id: h.employee.id, firstName: h.employee.firstName, lastName: h.employee.lastName }
      : null,
    type: h.type ? { id: h.type.id, name: h.type.name } : null,
    project: h.project
      ? {
          id: h.project.id,
          name: h.project.name,
          number: h.project.number,
          projectLeaderName: h.project.projectLeaderName,
        }
      : null,
    projectSecurityLink: h.projectSecurityLink
      ? {
          id: h.projectSecurityLink.id,
          code: h.projectSecurityLink.code,
          name: h.projectSecurityLink.name,
          parentName: h.projectSecurityLink.parentName,
          costType: h.projectSecurityLink.costType,
        }
      : null,
    hours: h.hours,
    logDate: h.logDate,
    comment: h.comment ?? null,
    hourlyRate: h.hourlyRate,
    invoicedAmount: h.invoicedAmount,
    isApproved: h.isApproved,
    approvedBy: h.approvedBy ?? null,
    approvedAt: h.approvedAt ?? null,
    isExternal: h.isExternal,
  }
}

export type GlobaleBron = {
  sleutel: string
  laad: (client: Bouw7Client) => Promise<unknown>
  /** Hoe lang een stand bruikbaar is voordat een schrijfactie hem zelf ververst (stamdata). */
  maxLeeftijdMs: number
}

const DAG_MS = 24 * 60 * 60_000

export const GLOBALE_BRONNEN: Record<GlobaleSoort, GlobaleBron> = {
  uren_venster: {
    sleutel: 'uren:venster',
    maxLeeftijdMs: DAG_MS,
    laad: async (client): Promise<UrenVensterPayload> => {
      const { van, tot } = urenVenster()
      const resp = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
        q: `logDate >= "${van}" AND logDate <= "${tot}" SORT(logDate, DESC)`,
      })
      return { van, tot, items: (resp.items ?? []).map(trimUurregel) }
    },
  },
  stam_project_statuses: {
    sleutel: 'stam:project_statuses',
    maxLeeftijdMs: DAG_MS,
    laad: (client) => client.get<unknown>('/list/project-statuses'),
  },
  stam_custom_attributes: {
    sleutel: 'stam:custom_attributes',
    maxLeeftijdMs: DAG_MS,
    laad: (client) => client.get<unknown>('/list/custom-attributes'),
  },
  stam_project_categories: {
    sleutel: 'stam:project_categories',
    maxLeeftijdMs: DAG_MS,
    laad: (client) => client.get<unknown>('/organization/project-categories'),
  },
  stam_branches: {
    sleutel: 'stam:branches',
    maxLeeftijdMs: DAG_MS,
    laad: (client) => client.get<unknown>('/list/branches'),
  },
}

