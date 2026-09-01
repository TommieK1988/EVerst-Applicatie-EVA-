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

/* ── Gedeelde token-cache ──────────────────────────────────────────────
 * Elke live tab bouwt zijn eigen client (`new Bouw7Client(...)` per aanroep). Leefde het token
 * alleen in het instance-veld, dan betekende dat per tab-load eerst een `POST /auth/login/...`
 * roundtrip vóór de eigenlijke call. Die login is voor elke instantie identiek — hij hangt enkel
 * aan (appName, apiKey) — dus cachen we hem module-breed en scheelt dat een roundtrip per load.
 *
 * Bewust een module-cache per serverinstantie en niet de Next data-cache: het gaat om een geheim,
 * en dat hoort niet in een cache die naar schijf gepersisteerd kan worden.
 */

type TokenCacheEntry = { token: string; verlooptOp: number }

/** Veiligheidsmarge: ververs ruim vóór de echte vervaltijd, zodat een call nooit onderweg verloopt. */
const TOKEN_MARGE_MS = 60_000
/** Vervaltijd wanneer het token geen leesbare JWT-`exp` draagt — bewust kort gehouden. */
const TOKEN_FALLBACK_TTL_MS = 10 * 60_000

const tokenCache = new Map<string, TokenCacheEntry>()
/** Lopende logins per sleutel, zodat gelijktijdige calls één login delen i.p.v. er N afvuren. */
const loginInFlight = new Map<string, Promise<string>>()

/**
 * Wanneer verloopt dit token? Bouw7 geeft een JWT terug en die draagt zijn eigen `exp` — dat is
 * betrouwbaarder dan een gok. Is het geen (leesbare) JWT, dan geldt de korte vaste TTL; verloopt
 * het token dan tóch eerder, dan vangt de bestaande 401-retry dat alsnog op.
 */
function tokenVerlooptOp(token: string): number {
  const delen = token.split('.')
  if (delen.length === 3) {
    try {
      const payload = JSON.parse(atob(delen[1].replace(/-/g, '+').replace(/_/g, '/')))
      if (typeof payload?.exp === 'number') return payload.exp * 1000 - TOKEN_MARGE_MS
    } catch {
      /* geen leesbare JWT-payload → val terug op de vaste TTL hieronder */
    }
  }
  return Date.now() + TOKEN_FALLBACK_TTL_MS
}

export class Bouw7Client {
  private token: string | null = null

  constructor(private apiKey: string, private appName: string = 'everts-platform') {}

  /** Cachesleutel: het token hangt uitsluitend aan deze twee waarden. */
  private get cacheSleutel(): string {
    return `${this.appName}\u0000${this.apiKey}`
  }

  /**
   * Authenticeer met de API key en krijg een Bearer token. Forceert altijd een verse login (dit is
   * óók het herstelpad na een 401) en vult daarmee de gedeelde cache bij.
   */
  async login(): Promise<void> {
    const sleutel = this.cacheSleutel
    let lopend = loginInFlight.get(sleutel)
    if (!lopend) {
      lopend = this.doeLogin().finally(() => loginInFlight.delete(sleutel))
      loginInFlight.set(sleutel, lopend)
    }
    this.token = await lopend
  }

  /** De feitelijke login-call. Vult de gedeelde cache en geeft het token terug. */
  private async doeLogin(): Promise<string> {
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
    const token = data.token ?? data.access_token ?? data
    if (typeof token !== 'string') {
      throw new Error('Bouw7 login: geen geldig token ontvangen')
    }

    tokenCache.set(this.cacheSleutel, { token, verlooptOp: tokenVerlooptOp(token) })
    return token
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
    const res = await this.fetchMetAuth(new URL(path, APOLLO_URL).toString(), {
      headers: {
        Accept: 'application/json',
        ...(xquery ? { 'X-Query': xquery } : {}),
      },
    })

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

  /** POST naar Athena — enkele write-endpoints zitten op Athena i.p.v. Heimdall (bv. `/wip/project-progress`). */
  async postAthena<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this._write<T>('POST', path, body, ATHENA_URL)
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
  private async _write<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, baseUrl: string = HEIMDALL_URL): Promise<T> {
    const res = await this.fetchMetAuth(new URL(path, baseUrl).toString(), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bouw7 ${method} ${baseUrl}${path} mislukt (${res.status}): ${text}`)
    }

    // Sommige write-endpoints geven 204/lege body terug.
    const text = await res.text().catch(() => '')
    return (text ? JSON.parse(text) : undefined) as T
  }

  private async _get<T>(baseUrl: string, path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, baseUrl)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }

    const res = await this.fetchMetAuth(url.toString())

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bouw7 GET ${baseUrl}${path} mislukt (${res.status}): ${text}`)
    }

    return res.json()
  }

  /** Download een binair bestand van Heimdall (bv. GET /storage/{hash}/download). */
  async getBinary(path: string): Promise<{ data: ArrayBuffer; contentType: string | null; fileName: string | null }> {
    const res = await this.fetchMetAuth(new URL(path, HEIMDALL_URL).toString())
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Bouw7 download ${path} mislukt (${res.status}): ${text}`)
    }
    const cd = res.headers.get('content-disposition')
    const m = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
    return {
      data: await res.arrayBuffer(),
      contentType: res.headers.get('content-type'),
      fileName: m?.[1] ? decodeURIComponent(m[1]) : null,
    }
  }

  /**
   * Fetch met Bearer-token en precies één herkansing na een 401.
   *
   * Een 401 betekent normaal "token verlopen": opnieuw inloggen en de call herhalen lost dat op.
   * Maar bij een ingetrokken of gewijzigde API-sleutel blijft élke poging 401 geven, en de eerdere
   * opzet herhaalde zichzelf dan onbegrensd (call → 401 → login → call → 401 → …) tot de request
   * in een timeout liep. Eén herkansing dekt het verlopen-token-geval; blijft het daarna 401, dan
   * valt de call door naar de gewone foutafhandeling van de aanroeper en zie je de echte oorzaak.
   */
  private async fetchMetAuth(
    url: string,
    opties: { method?: 'POST' | 'PUT' | 'DELETE'; headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> {
    await this.ensureAuth()

    const { headers, ...rest } = opties
    // Token per poging opnieuw uitlezen: na de herlogin hieronder is dat een ander token.
    const doeCall = () => fetch(url, { ...rest, headers: { ...headers, Authorization: `Bearer ${this.token}` } })

    const res = await doeCall()
    if (res.status !== 401) return res

    await this.login()
    return doeCall()
  }

  private async ensureAuth(): Promise<void> {
    if (this.token) return

    // Een nog geldig token van een eerdere request hergebruiken scheelt de login-roundtrip.
    const gecached = tokenCache.get(this.cacheSleutel)
    if (gecached && gecached.verlooptOp > Date.now()) {
      this.token = gecached.token
      return
    }

    await this.login()
  }
}

/** Projectbestand — GET /list/project-files (Heimdall, q-DSL op `project.id`). */
export type Bouw7ProjectFile = {
  id: number
  name?: string
  description?: string | null
  fileId?: number
  fileName?: string
  fileHash?: string
  /** Hash voor de download-URL: GET /storage/{secureHash}/download. */
  secureHash?: string
  fileSize?: number
  extension?: string
  category?: { id: number; name?: string } | null
  contact?: { id: number; name?: string } | null
  createdBy?: { id: number; username?: string } | null
  createdAt?: string
  updatedBy?: { id: number; username?: string } | null
  updatedAt?: string
}

/**
 * Offerte-herinnering — GET /list/quotation-reminders (Heimdall, q-DSL).
 * Filters: `processed = false` (open) · `quotation.projectId = {id}` (per dossier).
 */
export type Bouw7QuotationReminder = {
  id: number
  description: string | null
  /** Herinnerdatum (ISO). */
  remindAt: string | null
  /** true = afgehandeld/afgevinkt; open herinneringen hebben false. */
  processed: boolean
  quotation: {
    id: number
    subject?: string | null
    number?: string | null
    employeeId?: number | null
    /** Koppelt aan dossiers.bouw7_id. */
    projectId: number
  } | null
  /** Aanmaker; `username` = e-mailadres (te matchen op medewerkers.email). */
  createdBy?: { id: number; username: string | null } | null
  createdAt?: string | null
  updatedAt?: string | null
}

/**
 * To-do — GET /list/todos (Heimdall, q-DSL).
 * Filters: `isDone = false` (open) · `project.id = {id}` (per dossier).
 * Let op: toewijzing alleen als vrije-tekst namen (`associatedEmployeeNames`), geen employee-id's.
 */
export type Bouw7Todo = {
  id: number
  name: string
  description: string | null
  priority: number | null
  /** Deadline (ISO). */
  executeBefore: string | null
  isDone: boolean
  project: {
    id: number
    name?: string | null
    number?: string | null
    status?: string | null
  } | null
  /** Komma-gescheiden volledige namen, bv. "Marco Veltman, Teunis Hoefnagel". */
  associatedEmployeeNames: string | null
}

/**
 * To-do-detail: `GET /project/timeline/todo/{id}` (let op de prefix — `/todo/{id}` bestaat níét).
 * Rijker dan de lijstvorm: `employees` met échte id's i.p.v. de naam-string, plus `visibility`
 * en `sendNotifications`. Precies deze vorm gaat ook weer terug via `POST /project/timeline/todo`,
 * dus dit type dient als heen- én terugweg (read-modify-write).
 */
export type Bouw7TodoDetail = {
  id: number
  name: string
  description: string | null
  priority: number | null
  executeBefore: string | null
  /** 0 = zichtbaar voor iedereen (enige waarde die we in het veld zagen). */
  visibility: number | null
  isDone: boolean
  /** Bouw7 mailt de toegewezen medewerkers bij een wijziging. Sync-writes laten dit op `false`. */
  sendNotifications: boolean | null
  project: { id: number; name?: string | null } & Record<string, unknown> | null
  employees: { id: number; firstName?: string | null; lastName?: string | null }[] | null
  /** Server-side gezet; niet meesturen bij een write. */
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  updatedBy?: string
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
  /**
   * "Uurtarief per uurtype" — afgesproken verkoop-/kostprijstarief per uursoort voor deze relatie.
   * Veldnaam/shape defensief getypeerd: nog te bevestigen tegen de live API (mogelijk alleen op
   * het detail-endpoint `/contacts/{id}`). Wordt gesynct naar `relatie_uurtarieven`.
   */
  hourTypePrices?: Array<{
    hourType?: { id?: number; name?: string }
    hourTypeId?: number
    sellingPrice?: string | number | null
    costPrice?: string | number | null
    price?: string | number | null
  }>
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

// Let op: veldnamen hieronder zijn afgeleid van de *werkelijke* /list/employees-respons,
// niet van de oudere documentatie. De API levert o.a. `emailAddress` (niet `email`),
// `phoneNumber` (niet `phone`), `functionTitle` (niet `function`) en levert geen top-level
// `isActive`/`costRate`. Uurtarieven komen als strings binnen.
export type Bouw7Employee = {
  id: number
  firstName?: string
  prefix?: string
  lastName?: string
  emailAddress?: string
  phoneNumber?: string
  /** Woonadres: straat + huisnummer, bv. "De Wickelaan 36". */
  address?: string | null
  /** Postcode, zonder spatie, bv. "2265DE". */
  zipCode?: string | null
  /** Woonplaats. */
  city?: string | null
  functionTitle?: string
  department?: { id: number; name: string }
  branch?: { id: number; name: string }
  /** ISO-datum, bv. "1965-04-04T00:00:00+01:00". */
  birthDate?: string | null
  /** Datum in dienst, ISO-datum. */
  dateOfEmployment?: string | null
  /** Datum uit dienst (gevuld = niet meer actief), ISO-datum. */
  dateOfResignation?: string | null
  external?: boolean
  /** Kostprijs-uurtarief, als string bv. "75.00". */
  hourlyRate?: string | null
  /** Verkoop-uurtarief, als string bv. "125.0000". */
  sellingHourlyRate?: string | null
}

/**
 * Individueel verlof/vrije dag uit GET /list/days-off-per-employee (Heimdall, CalendarApi).
 * Toekomstgericht (kalender). Geen type-veld (verlof/ziek niet te onderscheiden), alleen `remark`.
 */
export type Bouw7DayOffPerEmployee = {
  id: number
  employee?: { id: number; firstName?: string; lastName?: string } | null
  /** ISO-datum/-datetime (live JSON, camelCase). */
  startDate?: string | null
  endDate?: string | null
  /** isAllDay=true bij hele-dag-verlof; hours is in de praktijk altijd "0.00". */
  isAllDay?: boolean | null
  hours?: string | number | null
  remark?: string | null
  /** Status-code (in de praktijk 0); alle statussen worden meegenomen. */
  status?: number | null
}

/** Organisatiebrede vrije dag (feestdag/bouwvak) uit GET /list/days-off (Heimdall, CalendarApi). */
export type Bouw7DayOff = {
  id: number
  startDate?: string | null
  endDate?: string | null
  name?: string | null
  /** Herhaalt jaarlijks (feestdagen). Live API-veld = `isAnnual`. */
  isAnnual?: boolean | null
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
  /**
   * Vastgoedobject waar dit project bij hoort (Bouw7 "objectenbeheer").
   * Geverifieerd aug 2026: 174 van de 579 projecten hebben dit gevuld, en één object kan
   * aan véél projecten hangen (Zamenhofstraat 6 → 18). Dit is de betrouwbare bron voor
   * `dossiers.object_id`; adres- of VvE-code-matching is dat aantoonbaar niet.
   */
  propertyAsset?: { id: number; name?: string } | null
  /** Adres — API levert `streetName` + losse `houseNumber`; géén `street`/`postCode`. */
  streetName?: string
  houseNumber?: string | null
  zipCode?: string
  city?: string
  startDate?: string
  endDate?: string
  /** Aanmaakdatum van het project (ISO-timestamp). Ongedocumenteerd maar aanwezig in de live response. */
  createdAt?: string
  updatedAt?: string
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
  /**
   * Maatwerkvelden (custom attributes) — komen plat mee op /list/projects met `ca`-prefix.
   * Andere aanwezige velden: caVveCode, caVerfleverancier, caWillenWeDezeMaken, caFactuuradres.
   * `caEindverantwoordelijkeOfferte` bevat de naam van de eindverantwoordelijke en wordt in de
   * sync gematcht op een medewerker → dossier-rol Controller. Alleen gevuld in de Offerte-fase.
   */
  caEindverantwoordelijkeOfferte?: string | null
  /**
   * Maatwerkveld "Offerte Sub-status" (dropdown, id 20987) — de gedeelde substatus-ladder voor de
   * aanvraag- én offerte-fase, óók gelezen/geschreven door de tweede app op Bouw7. Waarde is de
   * labelstring ("07. Verzonden"). Leidend zodra gevuld; zie `lib/bouw7/substatus-attr.ts`.
   */
  caOfferteSubstatus?: string | null
  /**
   * Maatwerkveld "Calculator" (fieldType `employee`, id 21012) — bevat de náám van de calculator.
   * Bouw7 verbiedt dat de projectleider tevens werkvoorbereider (`workPlanner`) is; EVA staat dat
   * wél toe. Dit veld is daarom de uitwijk: is `workPlanner` leeg, dan draagt het de calculator-rol.
   * Zie `lib/dossiers/bouw7-rollen.ts`.
   */
  caCalculator?: string | null
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
 * Meerwerkregel — GET /list/additional-work-lines (Heimdall, q-DSL op `projectId`).
 * De echte Bouw7-meerwerkregel-entiteit (MW-nummer). LET OP: `cost` is de **verkoopprijs** excl. btw,
 * `budgetAmount` is het **begrote** bedrag (kostprijs). `status`: 0=Geregistreerd, 1=Akkoord,
 * 2=Niet akkoord, 3=Opgeleverd, 4=Gefactureerd. `isProvisional`=stelpost.
 */
export type Bouw7AdditionalWorkLine = {
  id: number
  number?: string
  executor?: { id: number; name?: string; emailAddress?: string; type?: string } | null
  executorContactPerson?: { id: number; firstName?: string; lastName?: string; emailAddress?: string; phoneNumber?: string } | null
  description?: string
  cost?: string | number
  budgetAmount?: string | number
  date?: string
  note?: string
  status?: number
  projectId?: number
  quotation?: { id: number; subject?: string; number?: string } | null
  invoiceId?: number | null
  invoiceTermStatementId?: number | null
  invoiceTermId?: number | null
  isProvisional?: boolean
  respondedAt?: string | null
  respondedBy?: string | null
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
  /** Layout-identifier (string, bv. "default"). */
  layout?: string | null
}

/** Bouw7-offertestatus (GET /organization/quotation-statuses, of afgeleid uit /list/quotations). */
export type Bouw7QuotationStatus = { id: number; name?: string }

// EVA maakt bewust géén offertes aan in Bouw7 (`POST /quotation`): bij het verzenden van een
// EVA-offerte volgt alleen de projectstatus mee ("07. Verzonden" op het maatwerkveld Offerte
// Sub-status, zie `lib/bouw7/substatus-attr.ts`). Vandaar geen write-types voor offertes.

/**
 * Athena project-financial response — GET /project-financial/{id}
 * Velden zijn `number | string | null` omdat de API strings kan retourneren.
 * Gebruik altijd `toNum()` in FinancieelTab.tsx — nooit rechtstreeks optellen.
 */
export type Bouw7FinancialValue = number | string | null

type BFCostType = {
  budgeted?:    BFV
  prognosis?:   BFV
  realised?:    BFV
  unprocessed?: BFV
  openTerms?:   BFV
  expected?:    BFV
}
type BFV = Bouw7FinancialValue

export type Bouw7ProjectFinancial = {
  // LET OP: dit zijn objecten met budgeted/prognosis/realised/expected — géén losse getallen.
  // Het meerwerk-bedrag zit in additionalWork.prognosis (== .expected), niet in een scalar.
  fixedPrice?:       BFCostType
  additionalWork?:   BFCostType
  provisionalCosts?: BFCostType
  tailCosts?:        BFCostType
  revenue?:          BFCostType
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
  invoiceNumber?: string
  deliveryTicket?: {
    id: number
    cost?: number | string
    purchaseType?: number
    securityLink?: {
      code?: { id?: number; code?: string; name?: string; chapter?: { id?: number; name?: string } | null } | null
    } | null
  } | null
}

/**
 * Inkoopfactuur uit GET /list/purchase-invoices (Heimdall, q-DSL `project.id = {id}`).
 * Rijkere bron dan Apollo: bedragen excl/btw/incl, leverancier mét type, factuurnummer,
 * datums, betaalstatus en `purchaseTypeName` (type kosten). **Bevat géén bewakingscode** —
 * die komt uit de Apollo-variant (`Bouw7PurchaseInvoice.deliveryTicket.securityLink`), gemerged
 * op `deliveryTicket.id`. Envelope: `Bouw7PurchaseInvoiceListResponse`.
 */
export type Bouw7PurchaseInvoiceListItem = {
  id: number
  invoiceNumber?: string
  date?: string
  dueDate?: string
  datePaid?: string | null
  status?: number
  comment?: string | null
  subTotal?: string | number
  vatTotal?: string | number
  total?: string | number
  isMutable?: boolean
  supplier?: { id?: number; name?: string; type?: string; typeId?: number } | null
  deliveryTicket?: { id?: number; number?: string; description?: string; purchaseTypeName?: string; price?: string | number } | null
}

export type Bouw7PurchaseInvoiceListResponse = {
  items: Bouw7PurchaseInvoiceListItem[]
  subTotal?: string | number
  vat?: string | number
  total?: string | number
  count?: number
}

/**
 * Eén factuurregel van een inkoopfactuur (`Bouw7PurchaseInvoiceDetail.lines`).
 * `deliveryTicket.projectSecurityLink.code` = de bewakingscode van de regel.
 *
 * Let op: `unitName` bevat in de praktijk de string `"System.Xml.XmlElement"` (bug aan Bouw7-zijde) —
 * niet tonen aan de gebruiker.
 */
export type Bouw7PurchaseInvoiceLine = {
  id: number
  description?: string | null
  quantity?: string | number
  unitName?: string | null
  unitPrice?: string | number
  grossPrice?: string | number | null
  subTotal?: string | number
  vatTariffPercentage?: string | number
  vatTariffId?: number
  ledger?: string | null
  deliveryTicket?: {
    id?: number
    ticketNumber?: string | null
    cost?: string | number
    projectSecurityLink?: { id?: number; code?: string | null; name?: string | null } | null
  } | null
}

/**
 * Inkoopfactuur-detail uit **GET /purchase-invoicing/purchase-invoice/{id}** (Heimdall).
 *
 * Dít is de enige bron van de échte factuurregels (`lines`) én het factuurdocument (`file`).
 * Geverifieerd jul 2026 door het verzoek van Bouw7's eigen UI af te lezen.
 *
 * **Download het document met `file.uri`, NIET met `file.secureHash`**: `/storage/{uri}/download`
 * levert de PDF, `/storage/{secureHash}/...` geeft 404 (anders dan bij `Bouw7ProjectFile`, waar de
 * secureHash juist wél werkt). De EVA-proxy `/api/bouw7/bestand/[hash]` slikt beide vormen.
 *
 * **Niet te vinden via de gebruikelijke paden:** er bestaat géén `/list/purchase-invoice-lines`,
 * `/purchase-invoice/{id}` of Apollo-variant (allemaal 404) — de `/purchase-invoicing/`-prefix is
 * de sleutel. De embedded `deliveryTicket` op `Bouw7PurchaseInvoiceListItem` is géén regelbron:
 * die toont één bon met alleen een totaalbedrag, zonder aantal/stukprijs.
 *
 * **Kosten:** één call per factuur → alleen on-demand ophalen (bv. bij het uitklappen van een regel),
 * niet in bulk voor een heel dossier.
 */
export type Bouw7PurchaseInvoiceDetail = {
  id: number
  invoiceNumber?: string | null
  status?: number
  lines?: Bouw7PurchaseInvoiceLine[]
  file?: {
    id?: number
    name?: string | null
    extension?: string | null
    size?: number
    /** Storage-sleutel voor de download (`/storage/{uri}/download`). */
    uri?: string | null
    /** Let op: werkt NIET als downloadsleutel voor inkoopfacturen — gebruik `uri`. */
    secureHash?: string | null
  } | null
  fromBasecone?: boolean
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
  /**
   * Kostentype van de REGEL — eigen, nul-gebaseerde enum (0 Materiaal · 1 Onderaanneming ·
   * 2 Arbeid · 3 Materieel · 4 Overig). **Niet** dezelfde nummering als
   * `projectSecurityLink.costType` (de kostensoort van de bewakingscode: 1 Arbeid · 3 OA ·
   * 4 Materieel · 5 Materiaal). Zie WRITE-ENDPOINTS.md §2b.
   */
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

/**
 * Vastgoedobject uit `GET /list/property-assets` (Heimdall) — Bouw7's objectenbeheer.
 *
 * Geverifieerd tegen de live API (aug 2026). Twee dingen die de Swagger niet vertelt:
 * de spec kent dit schema helemáál niet (alleen POST/DELETE stonden gedocumenteerd), en
 * het pad is **meervoud**: `/list/property-asset` geeft 404, `GET /property-asset` geeft
 * 403 "Allow: POST, DELETE". Apollo `GET /search/property-assets` werkt ook maar levert
 * `project` niet mee.
 *
 * LET OP het adres: bij complexen zet Bouw7 de héle reeks in `streetName`
 * ("Netscherstraat 9 t/m 91 / Ruijsdaelstraat 65 t/m 73") en laat `houseNumber` en
 * `zipCode` leeg. Postcode is dus geen betrouwbare sleutel — match op `id`/`number`.
 */
export type Bouw7PropertyAsset = {
  id: number
  /** Objectcode, met de hand getypt: "HW1013", "KESSZAM6", "OMMEREN". Uniek en verplicht. */
  number: string
  name: string
  /** Bij lézen heet de factuurrelatie `invoiceRecipient`; bij schrijven `invoiceContact`. */
  invoiceRecipient?: { id: number; name?: string; type?: string; typeId?: number; emailAddress?: string | null } | null
  /** Bewoner — in de praktijk vrijwel altijd null. */
  resident?: { id: number; name?: string } | null
  /** Vrije opsomming van de adressen; bevat HTML. */
  description?: string | null
  streetName?: string | null
  houseNumber?: string | null
  zipCode?: string | null
  city?: string | null
  country?: string | null
  firstDeliveryDate?: string | null
  secondDeliveryDate?: string | null
  /** Vrijwel altijd null (44 van de 46) — géén 1:1-signaal met een project. */
  project?: { id: number; name?: string } | null
  createdAt?: string
  updatedAt?: string
}

/**
 * Schrijfvorm voor `POST /property-asset` (upsert: `id` erin = update).
 *
 * Verplicht volgens de live validatie (POST met lege body → 400):
 * `number`, `name` en **`invoiceContact`** — let op, dat veld heet bij het lezen
 * `invoiceRecipient`. Zonder een geldige `invoiceContact.id` weigert Bouw7 de create.
 */
export type Bouw7PropertyAssetCreate = {
  id?: number
  number: string
  name: string
  invoiceContact: { id: number }
  description?: string | null
  streetName?: string | null
  houseNumber?: string | null
  zipCode?: string | null
  city?: string | null
  country?: string | null
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
 *
 * Het endpoint werkt ook **zonder** projectfilter (bedrijfsbreed, bv. `logDate >= "…"`) — dat is de
 * bron van het Uren-overzicht onder Financieel. Twee valkuilen daarbij (geverifieerd jul 2026):
 * de query-params `?limit`/`?offset` worden genegeerd (beide pagina's geven de volledige set en
 * `limit`/`offset` komen als null terug) — begrenzen kan alleen via `LIMIT` in de q-DSL of een
 * `logDate`-filter. En `employee.isExternal` is niet HQL-mapped (→ 400); filter op het top-level
 * `isExternal`.
 */
export type Bouw7EmployeeHourLog = {
  id: number
  employee?: { id: number; firstName?: string; lastName?: string } | null
  type?: { id: number; name?: string } | null
  project?: { id: number; name?: string; number?: string; projectLeaderName?: string | null } | null
  projectSecurityLink?: { id?: number; code?: string | null; name?: string | null; parentName?: string | null; costType?: number } | null
  hours?: string | number
  logDate?: string
  comment?: string | null
  hourlyRate?: string | number
  invoicedAmount?: string | number
  isApproved?: boolean
  /** Geaccordeerd door — alleen gevuld als `isApproved` true is. */
  approvedBy?: { id?: number; username?: string } | null
  approvedAt?: string | null
  /** Ingehuurde kracht (ZZP/uitzend) i.p.v. eigen dienst. */
  isExternal?: boolean
  bookingStatus?: number
}

export type Bouw7EmployeeHourLogResponse = {
  items: Bouw7EmployeeHourLog[]
  totalHours?: string | number
  totalCost?: string | number
  count?: number
}

/**
 * Termijnstaat-kop uit GET /list/project-invoice-term-statements (Heimdall, q-DSL `project.id = {id}`).
 * Eén statement per project bundelt de losse termijnen. `fixedPrice` = totale aanneemsom.
 * De losse termijnen haal je op met `/list/project-invoice-terms` gefilterd op `statement.id`.
 */
export type Bouw7ProjectInvoiceTermStatement = {
  id: number
  project?: { id: number; number?: string; name?: string; status?: string } | null
  contact?: { id: number; name?: string } | null
  fixedPrice?: string | number
}

/**
 * Verkooptermijn uit GET /list/project-invoice-terms (Heimdall).
 * **Filter op `statement.id = {statementId}`** — `statement.project(.id)` is NIET HQL-mapped en
 * geeft een 400 (geverifieerd jul 2026). Haal eerst de termijnstaat op via
 * `/list/project-invoice-term-statements` (`project.id = {id}`), dan de termijnen per `statement.id`.
 * `invoiceLine` aanwezig = er is een factuurregel aangemaakt; of die factuur al verzonden is,
 * blijkt uit de bijbehorende `Bouw7SalesInvoice.isMailed` (invoiceLine.invoiceStatusId is
 * onbetrouwbaar: 0 hoort ook bij reeds verzonden facturen). `subtotal` = termijnbedrag excl. BTW.
 */
export type Bouw7ProjectInvoiceTerm = {
  id: number
  statement?: { id: number; projectId?: number; project?: { id: number }; contactId?: number; contactName?: string; fixedPrice?: string | number } | null
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
  invoiceNumber?: string | null
  status?: number
  isCredit?: boolean
  contact?: { id: number; name?: string } | null
  contactPersonName?: string | null
  /** Bij de globale `/list/invoices`-query (zonder project-filter) zit het project ín de factuur. */
  project?: { id: number; name?: string; number?: string; status?: string; statusId?: number } | null
  debtorNumber?: string | null
  date?: string | null
  dueDate?: string | null
  datePaid?: string | null
  subTotal?: string | number
  vatTotal?: string | number
  total?: string | number
  isMailed?: boolean
  /**
   * Interne notitie van de factuur (rich text/HTML). Zelfde veld als `internalNote` op de
   * `InvoiceDocument` van `GET /invoice/{id}` — de administratie noteert hier het
   * debiteurencontact. Op de lijst heet het `note`; die naam volgen we hier.
   */
  note?: string | null
}

/**
 * Onderaannemerscontract uit GET /list/subcontractor-contracts (Heimdall, q-DSL `project.id = {id}`).
 * `price` = contractbedrag, `outstandingCosts` = nog te factureren/openstaand, `statusName` = leesbare status.
 */
export type Bouw7SubcontractorContract = {
  id: number
  /** Contractnummer, bv. "20257.00064OA001". */
  number?: string
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

/**
 * Inkooporder-contract uit GET /list/purchase-order-contracts (Heimdall, q-DSL `project.id = {id}`).
 * De échte inkooporders (formele opdracht met leverancier/status/prijs) — niet te verwarren met de
 * bestelregels uit /list/contract-order-lines. Zelfde vorm als subcontractor-contracts.
 * `number` = ordernummer (bv. "20251.00062IO001"); `price` = orderbedrag; `outstandingCosts` = openstaand.
 */
export type Bouw7PurchaseOrderContract = {
  id: number
  number?: string
  supplier?: { id: number; name?: string; type?: string } | null
  status?: number
  statusName?: string
  name?: string
  description?: string
  price?: string | number
  outstandingCosts?: string | number
  projectSecurityLink?: { id?: number; code?: string | null; name?: string | null; parentName?: string | null } | null
}
