/**
 * Two-way rollen: schrijft de dossierrollen (projectleider, calculator, uitvoerder, controller)
 * terug naar het gekoppelde Bouw7-project.
 *
 * Mapping EVA-rol → Bouw7-veld (zie WRITE-ENDPOINTS.md §2 `POST /project`):
 *  - Projectleider → `projectLeader`  (CondensedEmployee { id })
 *  - Calculator    → `workPlanner` (Bouw7 "Werkvoorbereider") **én** het maatwerkveld "Calculator"
 *  - Uitvoerder    → `executor`
 *  - Controller    → custom attribute "Eindverantwoordelijke offerte" (vrije tekst = medewerkersnaam)
 *  - Teamleider    → géén Bouw7-veld (EVA-eigen rol), wordt niet teruggeschreven.
 *
 * ── Eén medewerker, twee rollen ──────────────────────────────────────────────
 * Bouw7 eist dat `projectLeader`, `workPlanner` en `executor` **drie verschillende** medewerkers
 * zijn; EVA staat dubbele rollen wél toe (bij Everts is dat een normale combinatie). Een naïeve
 * write levert daar een Bouw7-fout op — voor elk van de paren:
 * `400 validation_error — "workPlanner refers to an employee with ID #… that is already in use by
 * the property executor"`.
 *
 * Oplossing: EVA kiest bij een botsing wélk Bouw7-veld de medewerker houdt, in deze volgorde:
 * **projectleider > uitvoerder > calculator**. De verliezer wordt in Bouw7 juist leeggemaakt; EVA
 * blijft de volledige waarheid houden:
 *  - de calculator valt terug op het maatwerkveld **"Calculator"** (`caCalculator`, fieldType
 *    `employee` = vrije-tekstnaam, id 21012). Dat krijgt **altijd** de naam van de EVA-calculator
 *    (leeg = veld leegmaken), of `workPlanner` nu bezet raakt of niet;
 *  - de uitvoerder heeft geen uitwijkveld: die staat alleen in EVA. De sync laat `uitvoerder_id`
 *    staan zodra Bouw7 geen `executor` noemt, dus de rol gaat niet verloren.
 *
 * De sync leest gespiegeld terug: `workPlanner` → anders `caCalculator` (zie sync.ts). Zo round-trip't
 * de rol in alle gevallen en ontstaat er nooit een Bouw7-validatiefout.
 *
 * Read-modify-write: GET /project/{id} voor het verplichte `type` (+ de huidige rolbezetting en
 * maatwerkvelden), dan POST /project met `id`, `type` en alleen de gewijzigde velden.
 *
 * Faalt nooit hard: bij ontbrekende config/koppeling → { ok:false } met melding, zodat de aanroeper
 * (opslaan) een toast kan tonen zonder de EVA-update terug te draaien.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7Project } from '@/lib/bouw7/client'
import type { Bouw7WriteResult } from './bouw7-status'
import {
  getCustomAttributeDefs,
  mergeCustomAttributeValue,
  type Bouw7CustomAttrDef,
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
  /** Custom attribute "Calculator": `undefined` = niet wijzigen, string ('' = leeg). */
  calculatorNaam?: string | undefined
}

type AttrDef = { name?: string; code?: string; propertyName?: string }

/** Herkent het maatwerkveld "Eindverantwoordelijke Offerte" (`caEindverantwoordelijkeOfferte`, id 20960). */
const isEindverantwoordelijke = (d: AttrDef): boolean =>
  /eindverantwoordelijke/i.test(d.name ?? '') ||
  /eindverantwoordelijke/i.test(d.code ?? '') ||
  /eindverantwoordelijke/i.test(d.propertyName ?? '')

/** Herkent het maatwerkveld "Calculator" (`caCalculator`, id 21012). */
const isCalculatorAttr = (d: AttrDef): boolean =>
  d.propertyName === 'caCalculator' || /^calculator$/i.test((d.name ?? '').trim())

/** Naam van een Bouw7-employee-referentie ("Chris Glas"), zoals de `employee`-maatwerkvelden hem opslaan. */
const employeeNaam = (e?: { firstName?: string; lastName?: string } | null): string =>
  [e?.firstName, e?.lastName].filter(Boolean).join(' ').trim()

/**
 * Schrijf de rollen van een Bouw7-project terug. `rollen` bevat al opgeloste Bouw7-employee-id's
 * (en de namen voor de maatwerkvelden); het resolven EVA-uuid → Bouw7-id gebeurt in de aanroeper
 * (actions.ts), die de Supabase-client heeft.
 */
export async function schrijfBouw7Rollen(
  bouw7Id: string | number,
  rollen: Bouw7RollenInput,
): Promise<Bouw7WriteResult> {
  try {
    const client = await getBouw7Client()

    // Read-modify-write: huidig project ophalen voor het verplichte `type`, de huidige rolbezetting
    // (nodig voor de botsingscheck) én de bestaande maatwerkvelden.
    const project = await client.get<Bouw7Project & {
      type?: number
      customAttributeValues?: Bouw7CustomAttrValue[]
    }>(`/project/${bouw7Id}`)
    const type = project.type
    if (type == null) return { ok: false, error: 'Bouw7-projecttype onbekend; rollen niet teruggeschreven.' }

    const huidigePl = project.projectLeader?.id ?? null
    const huidigeWp = project.workPlanner?.id ?? null
    const huidigeEx = project.executor?.id ?? null

    // Doelstand = wat de aanroeper meegeeft, aangevuld met wat er nu in Bouw7 staat. Die aanvulling
    // is nodig omdat een botsing ook kan ontstaan door een rol die zélf niet wijzigt.
    const doelPl = rollen.projectLeaderId !== undefined ? rollen.projectLeaderId : huidigePl
    const doelWp = rollen.workPlannerId !== undefined ? rollen.workPlannerId : huidigeWp
    const doelEx = rollen.executorId !== undefined ? rollen.executorId : huidigeEx

    const zelfde = (a: RolRef, b: RolRef) => a != null && b != null && Number(a) === Number(b)

    // Vangnet: Bouw7 weigert dezelfde medewerker in twee van de drie rolvelden. Bij een botsing
    // wijkt het veld met de laagste prioriteit (projectleider > uitvoerder > calculator). Dit vangt
    // óók de aanroeper die alléén de projectleider wijzigt naar de persoon die al uitvoerder is.
    let executorId = rollen.executorId
    let effectieveEx = doelEx
    if (zelfde(doelPl, doelEx)) {
      // Leegmaken is hier verplicht, niet alleen "niet zetten": zolang Bouw7 de medewerker nog als
      // uitvoerder kent, weigert het de projectleider-write. EVA houdt `uitvoerder_id` zelf vast.
      executorId = null
      effectieveEx = null
    }

    let calculatorNaam = rollen.calculatorNaam
    let workPlannerId = rollen.workPlannerId
    if (zelfde(doelWp, doelPl) || zelfde(doelWp, effectieveEx)) {
      workPlannerId = null
      // Weet de aanroeper de calculator-naam niet, val dan terug op de werkvoorbereider die we
      // zojuist verdringen — anders zou de rol bij het leegmaken van `workPlanner` verdampen.
      if (calculatorNaam === undefined) calculatorNaam = employeeNaam(project.workPlanner)
    }

    const body: Record<string, unknown> = { id: Number(bouw7Id), type }
    if (rollen.projectLeaderId !== undefined) body.projectLeader = rollen.projectLeaderId != null ? { id: rollen.projectLeaderId } : null
    if (workPlannerId !== undefined)          body.workPlanner   = workPlannerId          != null ? { id: workPlannerId }          : null
    if (executorId !== undefined)             body.executor      = executorId             != null ? { id: executorId }             : null

    // Maatwerkvelden (Controller + Calculator) → één gemergede `customAttributeValues`, zodat de
    // overige velden (VvE-code, …) behouden blijven. Attribuut-id's via GET /list/custom-attributes
    // (werkt ook als het veld op dit project nog leeg is), één call voor beide. Is een attribuut
    // onvindbaar, dan slaan we alléén dát veld over.
    const teSchrijvenAttrs: { naam: string; match: (d: AttrDef) => boolean }[] = []
    if (rollen.controllerNaam !== undefined) teSchrijvenAttrs.push({ naam: rollen.controllerNaam, match: isEindverantwoordelijke })
    if (calculatorNaam !== undefined)        teSchrijvenAttrs.push({ naam: calculatorNaam,        match: isCalculatorAttr })

    if (teSchrijvenAttrs.length) {
      const defs: Bouw7CustomAttrDef[] = await getCustomAttributeDefs(client)
      let waarden: Bouw7CustomAttrValue[] = Array.isArray(project.customAttributeValues) ? project.customAttributeValues : []
      let gewijzigd = false
      for (const attr of teSchrijvenAttrs) {
        const attrId = defs.find(attr.match)?.id
        if (attrId == null) continue
        waarden = mergeCustomAttributeValue(waarden, attrId, attr.naam)
        gewijzigd = true
      }
      if (gewijzigd) body.customAttributeValues = waarden
    }

    // Niets te schrijven behalve id/type → geen call nodig.
    if (Object.keys(body).length <= 2) return { ok: true }

    await client.post('/project', body)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven van rollen naar Bouw7.' }
  }
}
