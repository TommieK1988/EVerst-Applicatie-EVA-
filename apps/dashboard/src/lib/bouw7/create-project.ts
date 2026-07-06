/**
 * Bouw7 — nieuw project aanmaken (EVA-aanvraag → Bouw7).
 *
 * Wordt gebruikt door `maakAanvraag` (lib/dossiers/actions.ts). Kern: `POST /project`
 * (upsert: géén `id` = create). Bouw7 kent op basis van de `branch` het projectnummer toe;
 * dat lezen we terug uit de create-respons (`fullProjectNumber`).
 *
 * Read-helpers voor de modal:
 *  - `getBouw7Categorieen()`  → GET /organization/project-categories
 *  - `getBouw7Branches()`     → GET /list/branches
 *
 * Faalt nooit hard richting de aanroeper: de VvE-code (custom attribute) is een best-effort
 * secundaire stap zodat een onbekend schema het project-create niet blokkeert.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7Project, Bouw7ListResponse, Bouw7ProjectStatus } from '@/lib/bouw7/client'

/** Bouw7-projectcategorie (GET /organization/project-categories). */
export type Bouw7ProjectCategory = { id: number; name: string; code?: string | null }

/** Bouw7 branch/vestiging (GET /list/branches). */
export type Bouw7Branch = { id: number; name: string; code?: string | null }

/** Normaliseer een Bouw7-respons naar een array (envelope `{items}` of kale array). */
function toItems<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const items = (res as { items?: unknown })?.items
  return Array.isArray(items) ? (items as T[]) : []
}

/** Alle Bouw7-projectcategorieën ({ id, name }). Voor de categorie-dropdown in de aanvraag-modal. */
export async function getBouw7Categorieen(): Promise<Bouw7ProjectCategory[]> {
  const client = await getBouw7Client()
  const res = await client.get<unknown>('/organization/project-categories')
  return toItems<Bouw7ProjectCategory>(res)
    .filter((c) => c && typeof c.id === 'number' && c.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Alle Bouw7-branches/vestigingen ({ id, name }). Voor de werkmaatschappij→branch-koppeling. */
export async function getBouw7Branches(): Promise<Bouw7Branch[]> {
  const client = await getBouw7Client()
  const res = await client.get<Bouw7ListResponse<Bouw7Branch>>('/list/branches', { q: 'LIMIT 200' })
  return (res.items ?? []).filter((b) => b && typeof b.id === 'number' && b.name)
}

/** Bepaal de status-id via de prefix uit de statusnaam (bv. "01." → "01. Offerte"). */
async function resolveStatusId(
  client: Awaited<ReturnType<typeof getBouw7Client>>,
  prefix: string,
): Promise<number | null> {
  const lijst = (await client.get<Bouw7ListResponse<Bouw7ProjectStatus>>('/list/project-statuses', { q: 'LIMIT 200' })).items ?? []
  const status = lijst.find((s) => (s.name ?? '').trim().startsWith(prefix))
  return status?.id ?? null
}

/**
 * Bepaal een geldig Bouw7 `type` (projecttype-int) voor een nieuw project. Bouw7 vereist dit veld
 * maar publiceert geen enum; we leiden het af van een bestaand project (read-modify-write-stijl).
 * Fallback op 1 als er (nog) geen project bestaat.
 */
async function resolveProjectType(
  client: Awaited<ReturnType<typeof getBouw7Client>>,
): Promise<number> {
  try {
    const lijst = (await client.get<Bouw7ListResponse<{ id: number }>>('/list/projects', { q: 'LIMIT 1' })).items ?? []
    const sample = lijst[0]
    if (sample?.id) {
      const detail = await client.get<{ type?: number }>(`/project/${sample.id}`)
      if (typeof detail.type === 'number') return detail.type
    }
  } catch {
    // val terug op default
  }
  return 1
}

export type Bouw7ProjectCreateInput = {
  name: string
  contactBouw7Id?: number | null
  contactPersonBouw7Id?: number | null
  categoryId?: number | null
  branchId?: number | null
  reference?: string | null
  information?: string | null
  street?: string | null
  houseNumber?: string | null
  zipCode?: string | null
  city?: string | null
  /** ISO/ATOM-datum. */
  startDate?: string | null
  /** ISO/ATOM-datum (deadline → deliveryDate). */
  deliveryDate?: string | null
  vveCode?: string | null
}

export type Bouw7ProjectCreateResult =
  | { ok: true; bouw7Id: number; dossiernummer: string | null }
  | { ok: false; error: string }

/**
 * Maak een nieuw Bouw7-project aan met status `01. Offerte`. Retourneert het toegekende
 * Bouw7-id + projectnummer. De VvE-code wordt best-effort als custom attribute geschreven
 * (blokkeert het project-create nooit).
 */
export async function maakBouw7Project(input: Bouw7ProjectCreateInput): Promise<Bouw7ProjectCreateResult> {
  try {
    const client = await getBouw7Client()

    const statusId = await resolveStatusId(client, '01.')
    if (statusId == null) return { ok: false, error: 'Bouw7-projectstatus met prefix "01." niet gevonden.' }
    const type = await resolveProjectType(client)

    const body: Record<string, unknown> = {
      type,
      status: { id: statusId },
      name: input.name,
    }
    if (input.contactBouw7Id)       body.contact = { id: input.contactBouw7Id }
    if (input.contactPersonBouw7Id) body.contactPerson = { id: input.contactPersonBouw7Id }
    if (input.categoryId)           body.category = { id: input.categoryId }
    if (input.branchId)             body.branch = { id: input.branchId }
    if (input.reference)            body.reference = input.reference
    if (input.information)          body.information = input.information
    if (input.street)               body.streetName = input.street
    if (input.houseNumber)          body.houseNumber = input.houseNumber
    if (input.zipCode)              body.zipCode = input.zipCode
    if (input.city)                 body.city = input.city
    if (input.startDate)            body.startDate = input.startDate
    if (input.deliveryDate)         body.deliveryDate = input.deliveryDate

    const created = await client.post<Bouw7Project & { id: number; fullProjectNumber?: string }>('/project', body)
    if (!created?.id) return { ok: false, error: 'Bouw7 gaf geen project-id terug.' }

    const dossiernummer = created.fullProjectNumber ?? created.projectCode ?? created.projectNumber ?? null

    // VvE-code als custom attribute — best-effort, mag de create nooit blokkeren.
    if (input.vveCode?.trim()) {
      await schrijfVveCode(client, created.id, type, input.vveCode.trim()).catch(() => {})
    }

    return { ok: true, bouw7Id: created.id, dossiernummer }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij aanmaken Bouw7-project.' }
  }
}

/**
 * Schrijf de VvE-code als Bouw7 custom attribute (`caVveCode`). Best-effort: het exacte write-schema
 * is nog niet bevestigd, dus we resolven de attribute-definitie op naam en proberen de bekende vorm.
 * Bij twijfel faalt deze stap stil — de VvE-code blijft dan alleen in EVA staan.
 */
async function schrijfVveCode(
  client: Awaited<ReturnType<typeof getBouw7Client>>,
  projectId: number,
  type: number,
  vveCode: string,
): Promise<void> {
  const res = await client.get<unknown>('/organization/custom-attributes')
  const attrs = toItems<{ id: number; name?: string; code?: string }>(res)
  const attr = attrs.find(
    (a) => /vve/i.test(a.code ?? '') || /vve/i.test(a.name ?? ''),
  )
  if (!attr) return
  await client.post('/project', {
    id: projectId,
    type,
    customAttributeValues: [{ customAttribute: { id: attr.id }, value: vveCode }],
  })
}
