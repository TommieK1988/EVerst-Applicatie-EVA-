/**
 * o365/graph.ts
 *
 * Dunne fetch-wrapper rond Microsoft Graph (v1.0). Twee varianten:
 *  - graph* : delegated, namens een specifieke medewerker (via diens tokens)
 *  - appGraph* : app-only (client credentials), voor gedeelde resources
 */

import { getValidAccessToken, getAppAccessToken } from './tokens'

import { fetchMetDeadline } from '@/lib/net/deadline'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

/* Ruim, want hier zit ook de PDF-conversie van een groot Word-document onder —
   maar niet oneindig. Zie lib/net/deadline.ts. */
const GRAPH_TIMEOUT_MS = 60_000

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path
  return GRAPH_BASE + (path.startsWith('/') ? path : `/${path}`)
}

export class GraphError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'GraphError'
  }
}

async function toError(res: Response, path: string): Promise<GraphError> {
  let detail = ''
  try {
    const body = await res.text()
    detail = body.slice(0, 500)
  } catch {
    /* negeren */
  }
  return new GraphError(res.status, `Graph ${path} → HTTP ${res.status} ${detail}`)
}

// ─── Delegated (namens medewerker) ──────────────────────────────────────────────

/**
 * Graph-call namens een medewerker. Bij 401 wordt het token één keer geforceerd
 * ververst en de call opnieuw geprobeerd.
 */
export async function graphFetch(
  medewerkerId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const doFetch = async () => {
    const token = await getValidAccessToken(medewerkerId)
    return fetchMetDeadline(buildUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    }, { dienst: 'Microsoft Graph', timeoutMs: GRAPH_TIMEOUT_MS })
  }

  let res = await doFetch()
  if (res.status === 401) {
    res = await doFetch()
  }
  return res
}

export async function graphGet<T>(medewerkerId: string, path: string): Promise<T> {
  const res = await graphFetch(medewerkerId, path)
  if (!res.ok) throw await toError(res, path)
  return (await res.json()) as T
}

export async function graphGetRaw(medewerkerId: string, path: string): Promise<Buffer> {
  const res = await graphFetch(medewerkerId, path)
  if (!res.ok) throw await toError(res, path)
  return Buffer.from(await res.arrayBuffer())
}

// ─── App-only (gedeelde resources) ──────────────────────────────────────────────

export async function appGraphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAppAccessToken()
  return fetchMetDeadline(buildUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  }, { dienst: 'Microsoft Graph', timeoutMs: GRAPH_TIMEOUT_MS })
}

export async function appGraphGet<T>(path: string): Promise<T> {
  const res = await appGraphFetch(path)
  if (!res.ok) throw await toError(res, path)
  return (await res.json()) as T
}

export async function appGraphGetRaw(path: string): Promise<Buffer> {
  const res = await appGraphFetch(path)
  if (!res.ok) throw await toError(res, path)
  return Buffer.from(await res.arrayBuffer())
}
