/**
 * ULU Cartracker API client.
 *
 * Authenticatie-flow:
 *   1. POST /sessions met { email, password }
 *   2. Response bevat access_token
 *   3. Alle volgende calls: header "Authorization: Token token=XXX"
 *
 * Base URL: default https://live.cartracker.nl/api/v1 — override via constructor.
 * Officiële docs: https://driveulu.github.io/api/
 */

import type {
  UluCompanyUser,
  UluSession,
  UluTrip,
  UluTripsResponse,
  UluUser,
  UluVehicle,
} from './types'

const DEFAULT_BASE_URL = 'https://live.cartracker.nl/api/v1'

export type UluClientOptions = {
  email: string
  password: string
  baseUrl?: string
  /** Optioneel bestaand token hergebruiken (vermijdt nieuwe login) */
  accessToken?: string
}

export class UluClient {
  private readonly baseUrl: string
  private readonly email: string
  private readonly password: string
  private accessToken: string | null = null
  private tokenFetchedAt: number | null = null
  private loginPromise: Promise<string> | null = null

  constructor(opts: UluClientOptions) {
    this.email = opts.email
    this.password = opts.password
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    if (opts.accessToken) {
      this.accessToken = opts.accessToken
      this.tokenFetchedAt = Date.now()
    }
  }

  /** Zorgt dat er een geldig access_token is en retourneert het. */
  async ensureToken(): Promise<string> {
    if (this.accessToken) return this.accessToken
    if (this.loginPromise) return this.loginPromise
    this.loginPromise = this.login().finally(() => {
      this.loginPromise = null
    })
    return this.loginPromise
  }

  /** Expliciete login. Overschrijft bestaand token. */
  async login(): Promise<string> {
    // ULU API (Rails-backed) verwacht Rails strong-parameters envelope:
    //   { "user": { "email": "...", "password": "..." } }
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        user: { email: this.email, password: this.password },
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`ULU login faalde: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`)
    }
    const json = (await res.json()) as {
      access_token?: string | { access_token?: string }
      user?: { access_token?: string | { access_token?: string } }
    }
    // ULU returneert `access_token` typisch genest:
    //   { access_token: { access_token: "…32c…" } }
    // Maar we ondersteunen ook een platte string of genest onder `user`.
    const raw = json.access_token ?? json.user?.access_token
    const token = typeof raw === 'string' ? raw : raw?.access_token
    if (!token) {
      throw new Error('ULU login: geen access_token in response')
    }
    this.accessToken = token
    this.tokenFetchedAt = Date.now()
    return this.accessToken
  }

  /** Generieke GET. Doet automatisch login + retry bij 401. */
  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, query)
    let token = await this.ensureToken()
    let res = await this.fetchWithToken(url, token)
    if (res.status === 401) {
      // Token mogelijk verlopen → opnieuw inloggen en retry
      this.accessToken = null
      token = await this.ensureToken()
      res = await this.fetchWithToken(url, token)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`ULU GET ${path} faalde: ${res.status} — ${body.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }

  /** Alle voertuigen van de account. */
  async listVehicles(): Promise<UluVehicle[]> {
    const res = await this.get<UluVehicle[] | { vehicles: UluVehicle[] }>('/vehicles')
    if (Array.isArray(res)) return res
    if (res && typeof res === 'object' && 'vehicles' in res) return res.vehicles as UluVehicle[]
    return []
  }

  /** Alle gebruikers (chauffeurs/medewerkers) zichtbaar voor deze account. */
  async listUsers(): Promise<UluUser[]> {
    const res = await this.get<UluUser[] | { users: UluUser[] }>('/users')
    if (Array.isArray(res)) return res
    if (res && typeof res === 'object' && 'users' in res) return res.users as UluUser[]
    return []
  }

  /** Koppelingen user ↔ voertuig (actieve bestuurders). */
  async listCompanyUsers(): Promise<UluCompanyUser[]> {
    const res = await this.get<UluCompanyUser[] | { company_users: UluCompanyUser[] }>(
      '/company_users',
    )
    if (Array.isArray(res)) return res
    if (res && typeof res === 'object' && 'company_users' in res) {
      return res.company_users as UluCompanyUser[]
    }
    return []
  }

  /**
   * Alle trips van een voertuig binnen een datumbereik. Paginering automatisch.
   *
   * **HARDE RECENCY-CAP — bevestigd 17-apr én opnieuw gemeten 21-jul-2026.**
   * De ULU API negeert date-range parameters én geeft alleen de laatst gereden
   * **~75 trips per voertuig** terug. Doorpagineren levert niets extra's op.
   * Meting: een sync over 1 jan – 21 jul haalde 1.297 rijen op vóór en 1.320 ná
   * het herstellen van de paginering (zie hieronder) — nagenoeg gelijk, en de
   * oudste opgehaalde rit was 6 juli. Oudere periodes zijn dus NIET via de API
   * te halen; daarvoor is de xlsx-import (Wagenpark → Ritten → Importeren) de
   * enige route.
   *
   * De paginering zélf was wel kapot: `if (chunk.length < pageSize) break`
   * vergeleek de ontvangen paginagrootte (~75) met de gevraagde (100) en stopte
   * daardoor altijd na pagina 1. Dat is hersteld — de envelope (`has_more` /
   * `total_pages`) stuurt nu, met terugval op de vorige paginagrootte. Het lost
   * de recency-cap hierboven niet op; verwacht daar dus geen extra historie van.
   *
   * Date-filtering blijft client-side. We stoppen zodra een pagina volledig vóór
   * `minStartDatum` ligt (trips komen nieuwste-eerst).
   *
   * @param vehicleId           ULU vehicle.id
   * @param opts.pageSize       gevraagde paginagrootte (ULU clamt naar ~75)
   * @param opts.minStartDatum  optioneel ISO (YYYY-MM-DD); drop trips vóór deze datum
   * @param opts.maxStartDatum  optioneel ISO (YYYY-MM-DD); drop trips ná deze datum
   * @param opts.maxPages       veiligheidsgrens op het aantal pagina's
   */
  async listTripsForVehicle(
    vehicleId: number,
    opts: {
      pageSize?: number
      minStartDatum?: string
      maxStartDatum?: string
      maxPages?: number
    } = {},
  ): Promise<UluTrip[]> {
    const pageSize = opts.pageSize ?? 100
    const maxPages = opts.maxPages ?? 200
    const trips: UluTrip[] = []
    const gezienIds = new Set<number>()
    let vorigeChunkGrootte: number | null = null
    let page = 1

    while (page <= maxPages) {
      const res = await this.get<UluTrip[] | UluTripsResponse>(
        `/vehicles/${vehicleId}/trips`,
        { page, limit: pageSize },
      )
      const envelope = Array.isArray(res) ? null : (res as UluTripsResponse)
      const chunk: UluTrip[] = Array.isArray(res) ? res : (envelope?.trips ?? [])
      if (chunk.length === 0) break

      // Negeert de server de `page`-parameter, dan krijgen we telkens dezelfde
      // rijen terug. Zonder deze check zouden we tot maxPages door blijven halen
      // en duplicaten stapelen.
      const nieuwe = chunk.filter((t) => t.id != null && !gezienIds.has(t.id))
      if (nieuwe.length === 0) break
      for (const t of nieuwe) gezienIds.add(t.id)
      trips.push(...nieuwe)

      // Voorbij het gevraagde begin? Dan is verder pagineren zinloos.
      const min = opts.minStartDatum
      if (min) {
        const alleOuder = chunk.every((t) => {
          const d = (t.start_at ?? '').slice(0, 10)
          return d !== '' && d < min
        })
        if (alleOuder) break
      }

      // Paginering: envelope is leidend; anders doorgaan zolang de pagina's
      // even groot blijven (gemeten aan wat de server teruggaf, niet aan wat wij
      // vroegen — dat was juist de oude fout).
      if (envelope?.has_more === false) break
      if (envelope?.total_pages != null && page >= envelope.total_pages) break
      if (envelope?.has_more == null && envelope?.total_pages == null) {
        if (vorigeChunkGrootte != null && chunk.length < vorigeChunkGrootte) break
        vorigeChunkGrootte = chunk.length
      }
      page += 1
    }

    // Client-side date filter
    const min = opts.minStartDatum
    const max = opts.maxStartDatum
    if (!min && !max) return trips
    return trips.filter((t) => {
      const d = (t.start_at ?? '').slice(0, 10)
      if (!d) return false
      if (min && d < min) return false
      if (max && d > max) return false
      return true
    })
  }

  /** Huidige access token (of null als nog niet ingelogd). Bruikbaar om te cachen. */
  getCachedToken(): { token: string | null; fetched_at: number | null } {
    return { token: this.accessToken, fetched_at: this.tokenFetchedAt }
  }

  // --- interne helpers -------------------------------------------------

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl + (path.startsWith('/') ? path : `/${path}`))
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== '') url.searchParams.set(k, String(v))
      }
    }
    return url.toString()
  }

  private async fetchWithToken(url: string, token: string): Promise<Response> {
    return fetch(url, {
      headers: {
        Authorization: `Token token=${token}`,
        Accept: 'application/json',
      },
    })
  }
}
