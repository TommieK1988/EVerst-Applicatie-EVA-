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

/** Custom-attribuutwaarde zoals die op een Bouw7-project meekomt (GET /project/{id}). */
type Bouw7CustomAttrValue = {
  id?: number
  customAttribute?: { id: number; name?: string; code?: string }
  value?: string | null
}

/** Herkent het custom attribute "Eindverantwoordelijke offerte" op naam of code. */
const isEindverantwoordelijke = (c?: { name?: string; code?: string }): boolean =>
  /eindverantwoordelijke/i.test(c?.name ?? '') || /eindverantwoordelijke/i.test(c?.code ?? '')

/**
 * Bouw de terug te schrijven `customAttributeValues[]` op basis van de bestaande waarden op het project
 * (read-modify-write). Het custom attribute "Eindverantwoordelijke offerte" krijgt de controller-naam;
 * alle andere maatwerkvelden (bv. VvE-code) blijven ongewijzigd behouden.
 *
 * De attribuut-definitie is niet los op te vragen (`GET /organization/custom-attributes` bestaat niet —
 * die route is POST-only), dus het attribuut-id komt uit het project zelf. Staat het attribuut niet op
 * het project, dan retourneren we `null` en wordt de controller-waarde (best-effort) overgeslagen.
 */
function bouwCustomAttributeValues(
  bestaand: Bouw7CustomAttrValue[],
  controllerNaam: string,
): { customAttribute: { id: number }; value: string }[] | null {
  if (!bestaand.some((v) => isEindverantwoordelijke(v.customAttribute))) return null
  return bestaand
    .filter((v) => v.customAttribute?.id != null)
    .map((v) => ({
      customAttribute: { id: v.customAttribute!.id },
      value: isEindverantwoordelijke(v.customAttribute) ? controllerNaam : (v.value ?? ''),
    }))
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

    // Controller → custom attribute "Eindverantwoordelijke offerte" (vrije tekst = medewerkersnaam).
    // Faalt nooit de rest van de rol-write: kan het attribuut-id niet uit het project worden gehaald,
    // dan slaan we alléén dit veld over.
    if (rollen.controllerNaam !== undefined) {
      const bestaand = Array.isArray(project.customAttributeValues) ? project.customAttributeValues : []
      const cav = bouwCustomAttributeValues(bestaand, rollen.controllerNaam)
      if (cav) body.customAttributeValues = cav
    }

    // Niets te schrijven behalve id/type → geen call nodig.
    if (Object.keys(body).length <= 2) return { ok: true }

    await client.post('/project', body)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven van rollen naar Bouw7.' }
  }
}
