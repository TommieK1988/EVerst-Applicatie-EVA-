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
import {
  resolveCustomAttributeId,
  mergeCustomAttributeValue,
  type Bouw7CustomAttrValue,
} from '@/lib/bouw7/custom-attributes'

/** Eén rol-referentie: `undefined` = niet wijzigen, `null` = leegmaken, `number` = zetten. */
type RolRef = number | null | undefined

export type Bouw7RollenInput = {
  projectLeaderId?: RolRef
  workPlannerId?: RolRef
  executorId?: RolRef
  /** Custom attribute "Eindverantwoordelijke offerte": `undefined` = niet wijzigen, string ('' = leeg). */
  controllerNaam?: string | undefined
}

/** Herkent het custom attribute "Eindverantwoordelijke Offerte" (`caEindverantwoordelijkeOfferte`). */
const isEindverantwoordelijke = (d: { name?: string; code?: string; propertyName?: string }): boolean =>
  /eindverantwoordelijke/i.test(d.name ?? '') ||
  /eindverantwoordelijke/i.test(d.code ?? '') ||
  /eindverantwoordelijke/i.test(d.propertyName ?? '')

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

    // Read-modify-write: huidig project ophalen voor het verplichte `type` én de bestaande maatwerkvelden.
    const project = await client.get<Bouw7Project & {
      type?: number
      customAttributeValues?: Bouw7CustomAttrValue[]
    }>(`/project/${bouw7Id}`)
    const type = project.type
    if (type == null) return { ok: false, error: 'Bouw7-projecttype onbekend; rollen niet teruggeschreven.' }

    const body: Record<string, unknown> = { id: Number(bouw7Id), type }
    if (rollen.projectLeaderId !== undefined) body.projectLeader = rollen.projectLeaderId != null ? { id: rollen.projectLeaderId } : null
    if (rollen.workPlannerId !== undefined)   body.workPlanner   = rollen.workPlannerId   != null ? { id: rollen.workPlannerId }   : null
    if (rollen.executorId !== undefined)      body.executor      = rollen.executorId      != null ? { id: rollen.executorId }      : null

    // Controller → custom attribute "Eindverantwoordelijke Offerte" (vrije tekst = medewerkersnaam).
    // Attribuut-id via GET /list/custom-attributes (werkt ook als het veld nog leeg is); read-modify-write
    // op de bestaande customAttributeValues zodat andere maatwerkvelden (bv. VvE-code) behouden blijven.
    // Faalt nooit de rest van de rol-write: is het attribuut onvindbaar, dan slaan we alléén dit veld over.
    if (rollen.controllerNaam !== undefined) {
      const attrId = await resolveCustomAttributeId(client, isEindverantwoordelijke)
      if (attrId != null) {
        const bestaand: Bouw7CustomAttrValue[] = Array.isArray(project.customAttributeValues) ? project.customAttributeValues : []
        body.customAttributeValues = mergeCustomAttributeValue(bestaand, attrId, rollen.controllerNaam)
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
