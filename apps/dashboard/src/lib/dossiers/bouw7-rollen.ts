/**
 * Two-way rollen: schrijft de dossierrollen (projectleider, calculator, uitvoerder, controller)
 * terug naar het gekoppelde Bouw7-project.
 *
 * Mapping EVA-rol → Bouw7-veld (zie WRITE-ENDPOINTS.md §2 `POST /project`):
 *  - Projectleider → `projectLeader`  (CondensedEmployee { id })
 *  - Calculator    → `workPlanner`    (Bouw7 "Werkvoorbereider" — Everts hanteert calculator ≡ werkvoorbereider)
 *  - Uitvoerder    → `executor`
 *  - Controller    → custom attribute "Eindverantwoordelijke offerte" (vrije tekst = medewerkersnaam)
 *  - Teamleider    → géén Bouw7-veld (EVA-eigen rol), wordt niet teruggeschreven.
 *
 * Read-modify-write: GET /project/{id} voor het verplichte `type`, dan POST /project met `id`, `type`
 * en alleen de gewijzigde rol-velden. Een leeggemaakte rol → `null` (best-effort clear).
 *
 * Faalt nooit hard: bij ontbrekende config/koppeling → { ok:false } met melding, zodat de aanroeper
 * (opslaan) een toast kan tonen zonder de EVA-update terug te draaien.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7Project } from '@/lib/bouw7/client'
import type { Bouw7WriteResult } from './bouw7-status'

/** Eén rol-referentie: `undefined` = niet wijzigen, `null` = leegmaken, `number` = zetten. */
type RolRef = number | null | undefined

export type Bouw7RollenInput = {
  projectLeaderId?: RolRef
  workPlannerId?: RolRef
  executorId?: RolRef
  /** Custom attribute "Eindverantwoordelijke offerte": `undefined` = niet wijzigen, string ('' = leeg). */
  controllerNaam?: string | undefined
}

/** Normaliseer een Bouw7-respons naar een array (envelope `{items}` of kale array). */
function toItems<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const items = (res as { items?: unknown })?.items
  return Array.isArray(items) ? (items as T[]) : []
}

/**
 * Bepaal de id van het custom attribute "Eindverantwoordelijke offerte" (`caEindverantwoordelijkeOfferte`).
 * Gematcht op naam/code — het exacte schema staat niet vast, dus best-effort.
 */
async function resolveEindverantwoordelijkeAttrId(
  client: Awaited<ReturnType<typeof getBouw7Client>>,
): Promise<number | null> {
  const res = await client.get<unknown>('/organization/custom-attributes')
  const attrs = toItems<{ id: number; name?: string; code?: string }>(res)
  const attr = attrs.find(
    (a) => /eindverantwoordelijke/i.test(a.name ?? '') || /eindverantwoordelijke/i.test(a.code ?? ''),
  )
  return attr?.id ?? null
}

/**
 * Schrijf de rollen van een Bouw7-project terug. `rollen` bevat al opgeloste Bouw7-employee-id's
 * (en de controller-naam voor het custom attribute); het resolven EVA-uuid → Bouw7-id gebeurt in
 * de aanroeper (actions.ts), die de Supabase-client heeft.
 */
export async function schrijfBouw7Rollen(
  bouw7Id: string | number,
  rollen: Bouw7RollenInput,
): Promise<Bouw7WriteResult> {
  try {
    const client = await getBouw7Client()

    // Read-modify-write: huidig project ophalen voor het verplichte `type`.
    const project = await client.get<Bouw7Project & { type?: number }>(`/project/${bouw7Id}`)
    const type = (project as { type?: number }).type
    if (type == null) return { ok: false, error: 'Bouw7-projecttype onbekend; rollen niet teruggeschreven.' }

    const body: Record<string, unknown> = { id: Number(bouw7Id), type }
    if (rollen.projectLeaderId !== undefined) body.projectLeader = rollen.projectLeaderId != null ? { id: rollen.projectLeaderId } : null
    if (rollen.workPlannerId !== undefined)   body.workPlanner   = rollen.workPlannerId   != null ? { id: rollen.workPlannerId }   : null
    if (rollen.executorId !== undefined)      body.executor      = rollen.executorId      != null ? { id: rollen.executorId }      : null

    // Controller → custom attribute "Eindverantwoordelijke offerte" (vrije tekst = medewerkersnaam).
    if (rollen.controllerNaam !== undefined) {
      const attrId = await resolveEindverantwoordelijkeAttrId(client)
      if (attrId != null) {
        body.customAttributeValues = [{ customAttribute: { id: attrId }, value: rollen.controllerNaam }]
      }
    }

    // Niets te schrijven behalve id/type → geen call nodig.
    if (Object.keys(body).length <= 2) return { ok: true }

    await client.post('/project', body)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven van rollen naar Bouw7.' }
  }
}
