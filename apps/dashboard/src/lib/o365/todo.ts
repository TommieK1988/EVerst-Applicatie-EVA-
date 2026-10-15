/**
 * o365/todo.ts
 *
 * Microsoft To Do via Graph, namens één medewerker (gedelegeerd, scope Tasks.ReadWrite).
 * Alleen transport en vertaling; wat er met de taken in EVA gebeurt staat in todo-sync.ts.
 *
 * Datums: we vragen Graph om alles in Nederlandse tijd terug te geven (`Prefer:
 * outlook.timezone`). Een To Do-deadline is een kalenderdag; zonder die header komt hij
 * als UTC-moment binnen en schuift hij rond middernacht een dag op.
 */

import { graphFetch, GraphError } from './graph'

const NL_TIJDZONE = 'W. Europe Standard Time'
const PREFER = `outlook.timezone="${NL_TIJDZONE}"`

/** Veiligheidsgrens op het volgen van nextLinks binnen één delta-ronde. */
const MAX_PAGINAS = 50

export interface TodoLijst {
  id: string
  displayName: string
  wellknownListName: 'none' | 'defaultList' | 'flaggedEmails' | 'unknownFutureValue'
  /** Gedeeld met anderen: iedereen ziet alle taken, en aan wie een taak is toegewezen geeft Graph niet door. */
  isShared?: boolean
  isOwner?: boolean
}

export interface TodoTaak {
  id: string
  title: string
  status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred'
  importance: 'low' | 'normal' | 'high'
  lastModifiedDateTime: string
  body?: { content?: string; contentType?: 'text' | 'html' }
  dueDateTime?: { dateTime: string; timeZone: string } | null
  linkedResources?: { webUrl?: string; displayName?: string }[]
}

export interface TodoVerwijderd {
  id: string
  '@removed': { reason: string }
}

export interface TodoDelta {
  taken: TodoTaak[]
  verwijderd: string[]
  deltaLink: string
}

/** Delta-link is verlopen of ongeldig: opnieuw beginnen met een volledige ronde. */
export class TodoDeltaVerlopen extends Error {}

async function todoGet<T>(medewerkerId: string, pad: string): Promise<T> {
  const res = await graphFetch(medewerkerId, pad, { headers: { Prefer: PREFER } })
  if (!res.ok) {
    const tekst = await res.text().catch(() => '')
    if (res.status === 410 || /syncStateNotFound|resyncRequired/i.test(tekst)) {
      throw new TodoDeltaVerlopen(tekst.slice(0, 200))
    }
    throw new GraphError(res.status, `Graph ${pad} → HTTP ${res.status} ${tekst.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/** Alle To Do-lijsten van de medewerker. Een gebruiker heeft er hooguit enkele tientallen. */
export async function haalTodoLijsten(medewerkerId: string): Promise<TodoLijst[]> {
  const lijsten: TodoLijst[] = []
  let pad: string | null = '/me/todo/lists?$top=100'
  for (let i = 0; pad && i < MAX_PAGINAS; i++) {
    const res: { value: TodoLijst[]; '@odata.nextLink'?: string } = await todoGet(medewerkerId, pad)
    lijsten.push(...res.value)
    pad = res['@odata.nextLink'] ?? null
  }
  return lijsten
}

/**
 * Wat er in een lijst veranderd is sinds `deltaLink`, of — zonder deltaLink — de hele lijst.
 * Volgt de nextLinks tot Graph een nieuwe deltaLink geeft.
 *
 * @throws TodoDeltaVerlopen als Graph de oude deltaLink niet meer kent
 */
export async function haalTodoDelta(
  medewerkerId: string,
  lijstId: string,
  deltaLink: string | null,
): Promise<TodoDelta> {
  const taken: TodoTaak[] = []
  const verwijderd: string[] = []
  let pad: string | null = deltaLink ?? `/me/todo/lists/${encodeURIComponent(lijstId)}/tasks/delta`

  for (let i = 0; i < MAX_PAGINAS; i++) {
    const res: {
      value: (TodoTaak | TodoVerwijderd)[]
      '@odata.nextLink'?: string
      '@odata.deltaLink'?: string
    } = await todoGet(medewerkerId, pad!)

    for (const item of res.value) {
      if ('@removed' in item) verwijderd.push(item.id)
      else taken.push(item)
    }
    if (res['@odata.deltaLink']) return { taken, verwijderd, deltaLink: res['@odata.deltaLink'] }
    pad = res['@odata.nextLink'] ?? null
    if (!pad) break
  }
  throw new Error(`To Do-delta voor lijst ${lijstId} gaf geen deltaLink terug.`)
}

/** Velden die EVA terugschrijft. Alleen meegegeven velden worden gewijzigd. */
export interface TodoPatch {
  title?: string
  status?: TodoTaak['status']
  /** 'YYYY-MM-DD', of null om de deadline te wissen. */
  deadline?: string | null
}

/** Wijzigt een To Do-taak en geeft de nieuwe `lastModifiedDateTime` terug. */
export async function patchTodoTaak(
  medewerkerId: string,
  lijstId: string,
  taakId: string,
  patch: TodoPatch,
): Promise<string> {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body.title = patch.title
  if (patch.status !== undefined) body.status = patch.status
  if (patch.deadline !== undefined) {
    body.dueDateTime = patch.deadline
      ? { dateTime: `${patch.deadline}T00:00:00`, timeZone: NL_TIJDZONE }
      : null
  }
  const pad = `/me/todo/lists/${encodeURIComponent(lijstId)}/tasks/${encodeURIComponent(taakId)}`
  const res = await graphFetch(medewerkerId, pad, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: PREFER },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new GraphError(res.status, `Graph PATCH ${pad} → HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`)
  }
  const taak = (await res.json()) as TodoTaak
  return taak.lastModifiedDateTime
}

/** Verwijdert een To Do-taak. Een taak die al weg is (404) telt als gelukt. */
export async function verwijderTodoTaak(medewerkerId: string, lijstId: string, taakId: string): Promise<void> {
  const pad = `/me/todo/lists/${encodeURIComponent(lijstId)}/tasks/${encodeURIComponent(taakId)}`
  const res = await graphFetch(medewerkerId, pad, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw new GraphError(res.status, `Graph DELETE ${pad} → HTTP ${res.status}`)
  }
}

// De vertaling To Do ↔ EVA is puur en staat apart, zodat de tests geen Graph-laag laden.
export * from './todo-vertaling'

export { todoWebUrl } from './todo-url'
