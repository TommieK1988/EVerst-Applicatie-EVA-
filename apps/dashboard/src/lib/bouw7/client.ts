/**
 * Bouw7 API clients.
 *
 * Heimdall (https://heimdall.bouw7.nl) — projecten, relaties, medewerkers
 * Athena   (https://athena.bouw7.nl)   — projectfinanciën, budgetAmount
 *
 * Auth: POST /auth/login/{appName}/apiKey → Bearer token (geldt voor beide APIs)
 */

const HEIMDALL_URL = 'https://heimdall.bouw7.nl'
const ATHENA_URL   = 'https://athena.bouw7.nl'
const APOLLO_URL   = 'https://apollo.bouw7.nl'

export class Bouw7Client {
  private token: string | null = null

  constructor(private apiKey: string, private appName: string = 'everts-platform') {}

  /** Authenticeer met de API key en krijg een Bearer token. */
  async login(): Promise<void> {
    const res = await fetch(`${HEIMDALL_URL}/auth/login/${this.appName}/apiKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `apiKey=${encodeURIComponent(this.apiKey)}`,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bouw7 login mislukt (${res.status}): ${text}`)
    }

    const data = await res.json()
    this.token = data.token ?? data.access_token ?? data
    if (typeof this.token !== 'string') {
      throw new Error('Bouw7 login: geen geldig token ontvangen')
    }
  }

  /** GET request naar Heimdall API. */
  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    return this._get<T>(HEIMDALL_URL, path, params)
  }

  /** GET request naar Athena API (financiën, budgetAmount). */
  async getAthena<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    return this._get<T>(ATHENA_URL, path, params)
  }

  /**
   * GET request naar de Apollo search-API (planning). Gebruikt dezelfde Bearer-token
   * als Heimdall. De query-DSL gaat mee via de `X-Query` header (geen URL-encoding nodig).
   * Bv. xquery = `project.id = 3494115 limit 1000`.
   */
  async getApollo<T = unknown>(path: string, xquery?: string): Promise<T> {
    await this.ensureAuth()
    const res = await fetch(new URL(path, APOLLO_URL).toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(xquery ? { 'X-Query': xquery } : {}),
      },
    })

    if (res.status === 401) {
      await this.login()
      return this.getApollo<T>(path, xquery)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bouw7 Apollo GET ${path} mislukt (${res.status}): ${text}`)
    }
    return res.json()
  }

  /**
   * Haal alle pagina's op van een Apollo search-endpoint. De query-DSL gebruikt
   * `limit N page M`; paginatie-info zit in `__metadata.page` van de response.
   */
  async getApolloAll<T = unknown>(path: string, filter: string, pageSize = 1000): Promise<T[]> {
    const all: T[] = []
    let page = 1
    // Veiligheidslimiet tegen oneindige loops; 50 × pageSize ruim voldoende per project.
    for (let i = 0; i < 50; i++) {
      const res = await this.getApollo<Bouw7ApolloResponse<T>>(
        path,
        `${filter} limit ${pageSize} page ${page}`.trim(),
      )
      const items = res.items ?? []
      all.push(...items)
      const total = res.__metadata?.page?.total ?? page
      if (page >= total || items.length === 0) break
      page++
    }
    return all
  }

  /**
   * POST naar Heimdall — create/update (upsert). Het Bouw7-patroon: een `id` in de
   * body betekent **update**, ontbreekt het dan wordt een nieuw record **aangemaakt**.
   * Nested referenties (contact, status, employee, …) vereisen alleen `{ id }`.
   * Zie WRITE-ENDPOINTS.md voor de schema's per resource.
   */
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this._write<T>('POST', path, body)
  }

  /** PUT naar Heimdall — o.a. de `.../update-status/{status}`-endpoints (vaak zonder body). */
  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this._write<T>('PUT', path, body)
  }

  /** DELETE naar Heimdall — body is een `Condensed{Resource}` met `{ id }`. (`delete` is gereserveerd → `del`.) */
  async del<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this._write<T>('DELETE', path, body)
  }

  /** Gedeelde write-implementatie (POST/PUT/DELETE) met token- en 401-retry, net als `_get`. */
  private async _write<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    await this.ensureAuth()
    const res = await fetch(new URL(path, HEIMDALL_URL).toString(), {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (res.status === 401) {
      await this.login()
      return this._write<T>(method, path, body)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bouw7 ${method} ${HEIMDALL_URL}${path} mislukt (${res.status}): ${text}`)
    }

    // Sommige write-endpoints geven 204/lege body terug.
    const text = await res.text().catch(() => '')
    return (text ? JSON.parse(text) : undefined) as T
  }

  private async _get<T>(baseUrl: string, path: string, params?: Record<string, string>): Promise<T> {
    await this.ensureAuth()
    const url = new URL(path, baseUrl)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    })

    if (res.status === 401) {
      await this.login()
      return this._get<T>(baseUrl, path, params)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bouw7 GET ${baseUrl}${path} mislukt (${res.status}): ${text}`)
    }

    return res.json()
  }

  private async ensureAuth(): Promise<void> {
    if (!this.token) await this.login()
  }
}

/* ── Response types (gebaseerd op Bouw7 API spec) ─────────────────── */

export type Bouw7Contact = {
  id: number
  name: string
  type?: { id: number; name: string }
  contactPersonName?: string | null
  contactPersons?: Bouw7ContactPerson[]
  streetName?: string
  houseNumber?: string
  zipCode?: string
  city?: string
  countryCode?: string
  emailAddress?: string
  phoneNumber?: string
  mobilePhoneNumber?: string
  cocNumber?: string
  vatNumber?: string
  iban?: string
  information?: string
  isActive?: boolean
}

export type Bouw7ContactPerson = {
  id: number
  contactId?: number  // aanwezig bij bulk /list/contactpersons zonder filter
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  function?: string
}

export type Bouw7Employee = {
  id: number
  firstName?: string
  prefix?: string
  lastName?: string
  email?: string
  phone?: string
  function?: string
  department?: { id: number; name: string }
  branch?: { id: number; name: string }
  isActive?: boolean
  hourlyRate?: number
  costRate?: number
}

export type Bouw7Project = {
  id: number
  projectCode?: string
  projectNumber?: string
  fullProjectNumber?: string
  name: string
  contact?: { id: number; name: string; type?: string; emailAddress?: string | null }
  /** Projectcontactpersoon — staat direct op het project (niet de org-primair). */
  contactPerson?: {
    id: number
    firstName?: string
    lastName?: string
    emailAddress?: string | null
    phoneNumber?: string | null
  } | null
  /** Projectstatus — in de API-response 'status' (niet 'projectStatus') */
  status?: { id: number; name: string; plansProject?: boolean; closesProject?: boolean; invoicesProject?: boolean; closesPlanning?: boolean }
  /** Projectcategorie — in de API-response 'category' (niet 'projectCategory') */
  category?: { id: number; name: string }
  projectLeader?: { id: number; firstName?: string; lastName?: string }
  workPlanner?:   { id: number; firstName?: string; lastName?: string }
  executor?:      { id: number; firstName?: string; lastName?: string } | null
  branch?: { id: number; name: string }
  /** Adres — API levert `streetName` + losse `houseNumber`; géén `street`/`postCode`. */
  streetName?: string
  houseNumber?: string | null
  zipCode?: string
  city?: string
  startDate?: string
  endDate?: string
  /**
   * Historisch veld — komt in de huidige API-response niet meer voor en bevatte
   * bovendien de prijs ínclusief BTW (ondanks de naam). Niet meer gebruiken.
   */
  totalExclVat?: number
  /** Vaste aanneemsom (contractbedrag) excl. BTW. */
  fixedPrice?: string
  budgetAmount?: number
  notes?: string
  information?: string
  reference?: string
}

/**
 * Bouw7 offerte. Opgehaald via /list/quotations.
 * Veldnamen geverifieerd via live API-response.
 */
export type Bouw7Quotation = {
  id: number
  quotationNumber?: string
  subject?: string
  reference?: string
  quotationDate?: string
  /** Medewerker die de offerte heeft opgesteld (calculator/werkvoorbereider). */
  employee?: { id: number; firstName?: string; lastName?: string; prefix?: string }
  /** Verwijzing naar het Bouw7-project. */
  project?: { id: number; name?: string }
  contact?: { id: number; name?: string }
  /**
   * Verkoopprijs excl. BTW (geverifieerd: over alle offertes is total/subtotal exact
   * de BTW-factor — 1,21 / 1,09 / gemengd / 1,00 bij BTW-verlegd). Dit is dus GEEN kostprijs.
   */
  subtotal?: number
  /** Verkoopprijs incl. BTW. */
  total?: number
  commissionPercentage?: number | null
  quotationStatus?: { id: number; name?: string }
  createdAt?: string
  updatedAt?: string
}

/**
 * Offerteregel uit het detail-endpoint GET /quotation/{id} (chapters[].lines[]).
 * `subtotal` is de verkoopprijs van de regel; de calculatievelden (laborTotal,
 * materialTotal, …, calculationTotal) bevatten de kostprijsopbouw uit de
 * Bouw7-calculatiemodule — null als de regel niet gecalculeerd is.
 */
export type Bouw7QuotationLine = {
  id: number
  description?: string
  quantity?: string | number
  unit?: string
  price?: string | number
  subtotal?: string | number
  vatTariffPercentage?: string | number
  vatTariffObject?: Bouw7VatTariff | null
  /** Optionele regel — telt niet mee in de aanneemsom. */
  option?: boolean
  laborTotal?: string | number | null
  materialTotal?: string | number | null
  equipmentTotal?: string | number | null
  subcontractingTotal?: string | number | null
  purchaseOrderTotal?: string | number | null
  garbageTotal?: string | number | null
  /** Totale gecalculeerde kostprijs van de regel (som van de deel-totalen). */
  calculationTotal?: string | number | null
}

/** BTW-tarief zoals Bouw7 het meegeeft op regels en opslagen. */
export type Bouw7VatTariff = {
  id?: number
  /** Bv. 'Hoog 21%', 'Laag 9%', 'Verlegd 21'. */
  label?: string
  percentage?: string | number
}

/** Offerte-detail — GET /quotation/{id} (enkelvoud). Alleen de velden die EVA gebruikt. */
export type Bouw7QuotationDetail = {
  id: number
  /** LET OP: hoofdstukken met additionalWork=true (meerwerk/opties) tellen NIET mee in subtotal/total. */
  chapters?: { id: number; name?: string; hasPrice?: boolean; additionalWork?: boolean; lines?: Bouw7QuotationLine[] }[]
  /** AK-opslag als percentage over de regelsom, bv. "10". */
  overheads?: string | number | null
  overheadsVatTariff?: Bouw7VatTariff | null
  /** W&R-opslag als percentage over de regelsom, bv. "5". */
  profitAndRisk?: string | number | null
  profitAndRiskVatTariff?: Bouw7VatTariff | null
}

/**
 * Athena project-financial response — GET /project-financial/{id}
 * Velden zijn `number | string | null` omdat de API strings kan retourneren.
 * Gebruik altijd `toNum()` in FinancieelTab.tsx — nooit rechtstreeks optellen.
 */
export type Bouw7FinancialValue = number | string | null

type BFCostType = {
  budgeted?:  BFV
  prognosis?: BFV
  realised?:  BFV
}
type BFV = Bouw7FinancialValue

export type Bouw7ProjectFinancial = {
  fixedPrice?:      BFV
  additionalWork?:  BFV
  provisionalCosts?: BFV
  tailCosts?:       BFV
  revenue?: {
    budgeted?:  BFV
    prognosis?: BFV
    realised?:  BFV
  }
  costs?: {
    labor?:          BFCostType
    purchaseOrder?:  BFCostType
    subcontracting?: BFCostType
    material?:       BFCostType
    equipment?:      BFCostType
    other?:          BFCostType
  }
  result?:             BFCostType
  generalCostsProfit?: BFCostType
}

export type Bouw7ListResponse<T> = {
  items: T[]
  count: number
  limit: number
  offset: number
}

/* ── Apollo search-API (planning) ─────────────────────────────────── */

/** Generieke Apollo search-response. Paginatie zit in `__metadata.page`. */
export type Bouw7ApolloResponse<T> = {
  items: T[]
  __metadata?: {
    page?: { current: number; total: number }
    rows?: { total: number; perPage: number; offset: number }
  }
}

export type Bouw7EmployeeRef = {
  id: number
  givenName?: string
  familyName?: string
  emailAddress?: string | null
}

/**
 * Plan-item uit GET /search/plan-items (Apollo). Velden geverifieerd via live API.
 *
 * - `securityPlanningLink.securityCode.chapter` = bewakingscode-hoofdstuk → EVA-fase ("Hoofdtaak").
 * - `securityPlanningLink.securityCode` = de **Taak** (bv. "Schilderwerk", code "SW.A").
 * - het plan-item zelf → EVA-activiteit.
 *
 * LET OP: de Apollo-search geeft de **toegewezen medewerkers NIET** terug. Die zitten
 * uitsluitend in het Heimdall detail-endpoint `GET /plan-item/{id}` (`Bouw7PlanItemDetail`).
 */
export type Bouw7PlanItem = {
  id: number
  name: string
  startDate: string            // "YYYY-MM-DD HH:mm:ss"
  endDate: string
  isAllDay?: boolean
  hours?: number
  requisite?: number
  remark?: string | null
  color?: string | null
  isProcessed?: boolean
  project?: {
    id: number
    name?: string
    number?: string
    status?: { id: number; name?: string }
    category?: { id: number; name?: string; code?: string }
  } | null
  department?: { id: number; name?: string; isActive?: boolean } | null
  securityPlanningLink?: {
    id: number
    securityCode?: {
      id: number
      name?: string
      code?: string
      chapter?: { id: number; name?: string; code?: string } | null
    } | null
  } | null
  createdAt?: string
  updatedAt?: string
}

/**
 * Detail van één plan-item — Heimdall `GET /plan-item/{id}`. Bevat de toegewezen
 * `employees[]` (en `contacts[]`) die de Apollo-search niet meegeeft. LET OP: hier
 * heten de naamvelden `firstName`/`lastName` (niet `givenName`/`familyName`).
 */
export type Bouw7PlanItemEmployee = {
  id: number
  firstName?: string
  lastName?: string
}

export type Bouw7PlanItemDetail = {
  id: number
  notes?: string | null
  isProcessed?: boolean
  employees?: Bouw7PlanItemEmployee[]
  contacts?: { id: number; name?: string }[]
}

/**
 * Uitgebreid project-type met financiële managementdata.
 * Bouw7 retourneert deze velden op het project-overzicht wanneer
 * de query-parameter `include=financials` meegegeven wordt.
 */
export type Bouw7ProjectManagement = Bouw7Project & {
  // Kosten & omzet
  bookedCosts?: number            // Geboekte kosten
  percentageComplete?: number     // % gereed (0–100)
  totalForecast?: number          // Totale prognose
  expectedResult?: number         // Verwacht resultaat
  marginPercentage?: number       // % marge op prognose
  revenueBasedOnPercentage?: number   // Omzet o.b.v. % gereed
  resultBasedOnPercentage?: number    // Resultaat o.b.v. % gereed
  // Gereed werken
  invoiced?: number               // Gefactureerd
  resultFinancial?: number        // Resultaat (gereed)
  marginPercentageFinancial?: number  // % marge (gereed)
  differenceMarginPercentage?: number // Verschil % marge
  isCompleted?: boolean           // true = Gereed Werken
}

/* ── Projectbewaking per bewakingscode (Control) ──────────────────── */

/**
 * Bouw7 kostensoort-id's (Athena project-control `cost-type/{id}`). Geverifieerd:
 * `costAmount` per soort == `/project-financial` realisatie, `budgetAmount` == budgeted.
 */
export const BOUW7_COST_TYPE = {
  1: 'Arbeid',
  2: 'Inkoop',
  3: 'Onderaanneming',
  4: 'Materieel',
  5: 'Materiaal',
  6: 'Afval',
} as const

export type Bouw7CostTypeId = keyof typeof BOUW7_COST_TYPE

/** Uren-blok op een control-regel. Alle velden zijn echte numbers. */
export type Bouw7ControlHourInfo = {
  budgetHours?: number              // Begrote uren
  prognosisHours?: number           // Prognose-uren
  costHours?: number                // Geboekte/bestede uren
  contractCostHours?: number
  allowedHours?: number             // Toegestane uren (standopname)
  totalPrognosisHours?: number
  additionalWorkHours?: number      // Meerwerk-uren
}

/**
 * Eén regel uit GET /project/{id}/cost-type/{costType}/chapters (Athena). Zowel
 * `chapterInfo` (hoofdstuk-aggregatie), elke `securityCodes[]`-regel, als het top-level
 * `totals`-blok hebben deze vorm. Bedragen/uren zijn numbers.
 */
export type Bouw7ControlEntry = {
  id?: number
  code?: string
  name?: string
  status?: number
  progress?: number                 // % gereed
  adjustment?: number
  budgetAmount?: number             // Begroot bedrag
  prognosisAmount?: number          // Totale prognose
  costAmount?: number               // Geboekte kosten (besteed)
  contractCostAmount?: number       // Inkooporders/onderaannemer-contracten (verplicht)
  termAmount?: number
  allowedAmount?: number            // Standopname/toegestaan
  additionalWorkAmount?: number     // Meerwerk
  totalBudgetAmount?: number
  totalPrognosisAmount?: number
  resultBudgetAmount?: number
  resultEndAmount?: number
  remarkCount?: number
  hourInfo?: Bouw7ControlHourInfo
  securityObject?: { id: number; name?: string } | null
  pslIds?: number[]
}

export type Bouw7ControlChapter = {
  chapterInfo: Bouw7ControlEntry
  securityCodes: Bouw7ControlEntry[]
}

/**
 * Response van GET /project/{id}/cost-type/{costType}/chapters (Athena).
 * `chapterInfo.name === 'uncoded_costs'` (id 0) = kosten zonder bewakingscode.
 */
export type Bouw7ControlResponse = {
  count: number
  limit: number | null
  offset: number | null
  totals: Bouw7ControlEntry
  items: Bouw7ControlChapter[]
}

/**
 * Inkoopfactuur uit GET /search/purchase-invoices (Apollo), gefilterd op `project.id`.
 * Bron voor "geboekte kosten" = de inkoop waarvoor daadwerkelijk een factuur is ontvangen.
 * Meerdere facturen (termijnen) kunnen naar dezelfde `deliveryTicket.id` verwijzen → dedupe.
 */
export type Bouw7PurchaseInvoice = {
  id: number
  deliveryTicket?: {
    id: number
    cost?: number | string
    securityLink?: {
      code?: { id?: number; code?: string; name?: string; chapter?: { id?: number; name?: string } | null } | null
    } | null
  } | null
}

/**
 * Bestelregel/contractregel uit GET /list/contract-order-lines (Heimdall), via `q`-DSL gefilterd
 * op `project.id`. `projectSecurityLink.code` = bewakingscode (kan ontbreken → kosten zonder code).
 * `contact.type`: 'subcontractor' = onderaanneming, anders inkoop (leverancier/handmatig).
 */
export type Bouw7ContractOrderLine = {
  id: number
  description?: string
  /** Aantal en aantal-factor; werkelijk aantal = quantity × quantityFactor. */
  quantity?: number | string
  quantityFactor?: number | string
  unit?: string
  unitPrice?: number | string
  totalPrice?: number | string
  costType?: number
  contact?: { id?: number; name?: string; type?: string } | null
  projectSecurityLink?: {
    id?: number
    code?: string | null
    parentName?: string | null
    costType?: number
    status?: number
  } | null
  purchaseOrderContract?: unknown | null
  subcontractorContract?: unknown | null
}

/* ── Two-way / list-endpoints (geverifieerd via Swagger jun 2026) ─────
 * Alle onderstaande lijsten zijn Heimdall `GET /list/...` met een `q`-HQL-filter
 * (zelfde mechaniek als /list/contract-order-lines: `client.get(path, { q })`). */

/** Projectstatus uit GET /list/project-statuses (Heimdall). Bron voor de status-id bij terugschrijven. */
export type Bouw7ProjectStatus = {
  id: number
  name: string
  closesProject?: boolean
  invoicesProject?: boolean
  plansProject?: boolean
  closesPlanning?: boolean
}

/**
 * Urenregel uit GET /list/hour-logs/employee (Heimdall, q-DSL `project.id = {id}`).
 * `type` = uursoort (hourType), `hours`/`hourlyRate`/`invoicedAmount` zijn strings.
 * Response-envelope: `Bouw7EmployeeHourLogResponse` ({ items, totalHours, totalCost, count }).
 */
export type Bouw7EmployeeHourLog = {
  id: number
  employee?: { id: number; firstName?: string; lastName?: string } | null
  type?: { id: number; name?: string } | null
  project?: { id: number; name?: string } | null
  projectSecurityLink?: { id?: number; code?: string | null; name?: string | null; parentName?: string | null; costType?: number } | null
  hours?: string | number
  logDate?: string
  comment?: string | null
  hourlyRate?: string | number
  invoicedAmount?: string | number
  isApproved?: boolean
  bookingStatus?: number
}

export type Bouw7EmployeeHourLogResponse = {
  items: Bouw7EmployeeHourLog[]
  totalHours?: string | number
  totalCost?: string | number
  count?: number
}

/**
 * Verkooptermijn uit GET /list/project-invoice-terms (Heimdall, q-DSL `statement.project.id = {id}`).
 * `invoiceLine` aanwezig = termijn is daadwerkelijk gefactureerd. `subtotal` = termijnbedrag excl. BTW.
 */
export type Bouw7ProjectInvoiceTerm = {
  id: number
  statement?: { id: number; project?: { id: number }; contact?: { id: number; name?: string }; fixedPrice?: string | number } | null
  description?: string
  percentage?: string | number
  subtotal?: string | number
  invoiceableAt?: string | null
  vatTariffPercentage?: string | number
  vatTariff?: Bouw7VatTariff | null
  invoiceLine?: { id: number; invoiceId?: number; invoiceStatusId?: number } | null
}

/**
 * Verkoopfactuur uit GET /list/invoices (Heimdall, q-DSL `project.id = {id}`).
 * `status` = integer-statuscode; `datePaid` gevuld = betaald. Bedragen zijn strings.
 * Response-envelope heeft totalen `subTotal`/`vat`/`total`.
 */
export type Bouw7SalesInvoice = {
  id: number
  invoiceNumber?: string
  status?: number
  isCredit?: boolean
  contact?: { id: number; name?: string } | null
  contactPersonName?: string | null
  date?: string
  dueDate?: string
  datePaid?: string | null
  subTotal?: string | number
  vatTotal?: string | number
  total?: string | number
  isMailed?: boolean
}

/**
 * Onderaannemerscontract uit GET /list/subcontractor-contracts (Heimdall, q-DSL `project.id = {id}`).
 * `price` = contractbedrag, `outstandingCosts` = nog te factureren/openstaand, `statusName` = leesbare status.
 */
export type Bouw7SubcontractorContract = {
  id: number
  subcontractor?: { id: number; name?: string } | null
  status?: number
  statusName?: string
  name?: string
  description?: string
  price?: string | number
  outstandingCosts?: string | number
  projectSecurityLink?: { id?: number; code?: string | null; name?: string | null; parentName?: string | null } | null
  expectedCompletionDate?: string | null
  acceptedAt?: string | null
}
