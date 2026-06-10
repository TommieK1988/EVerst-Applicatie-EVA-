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
  totalExclVat?: number
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
  /** Subtotaal — basisbedrag vóór opslag, AK, winst/risico en commissie (= kostprijs). */
  subtotal?: number
  /** Totaal — eindbedrag incl. alle opslagen = verkoopprijs excl. BTW. */
  total?: number
  commissionPercentage?: number | null
  quotationStatus?: { id: number; name?: string }
  createdAt?: string
  updatedAt?: string
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
