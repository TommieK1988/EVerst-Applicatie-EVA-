'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/taken/supabase/server'
import { createAdminClient } from '@everts/database/server'
import type {
  CompletionActieType,
  DbTaskCompletionActie,
  DbTaskList,
} from '@/lib/taken/supabase/database.types'
import { berekenDeadline } from '@/lib/taken/deadlines'
import {
  DOSSIER_ROL_SELECT,
  kopieerCompletionActies,
  resolveerToewijzingen,
} from '@/lib/taken/kloon'
import { herberekenDossierNu } from './deadlines'

// ─── Sjabloon activeren ───────────────────────────────────────────────────────

/**
 * Kloon een sjabloon-actielijst naar een concrete instantie gekoppeld aan een dossier
 * óf een medewerker. Resolveer rol-/medewerker-zelf-toewijzingen naar echte gebruikers.
 *
 * Deadlines volgen het anker van de sjabloontaak (deadline_basis + deadline_dagen).
 * Ankers op de detailplanning worden hier nog niet vastgeklikt: die kan bij activatie
 * nog leeg zijn en later schuiven, dus die rekent herberekenDossierNu uit — net als de
 * herhalende taken, die hier bewust worden overgeslagen. Medewerker-ankers
 * (in_dienst_vanaf/uit_dienst_per) zijn wél meteen bekend en rekenen hier direct mee.
 */
export async function activeerSjabloon(input: {
  template_id: string
  dossier_id?: string
  medewerker_id?: string
  streefdatum?: string
}): Promise<{ lijst_id: string }> {
  const supabase = createAdminClient()

  if (!input.dossier_id && !input.medewerker_id) throw new Error('Geen dossier of medewerker opgegeven')

  // Haal sjabloon op
  const { data: sjabloon, error: sjabloonError } = await supabase
    .from('task_lists')
    .select('*')
    .eq('id', input.template_id)
    .eq('is_template', true)
    .single()

  if (sjabloonError || !sjabloon) throw new Error('Sjabloon niet gevonden')

  // Context-bewaking: een medewerker-sjabloon hoort niet op een dossier te belanden (en andersom).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sjabloonContext = ((sjabloon as any).context ?? 'dossier') as 'dossier' | 'medewerker'
  if (input.dossier_id && sjabloonContext !== 'dossier') {
    throw new Error('Dit sjabloon is voor medewerkers en kan niet op een dossier geactiveerd worden')
  }
  if (input.medewerker_id && sjabloonContext !== 'medewerker') {
    throw new Error('Dit sjabloon is voor dossiers en kan niet op een medewerker geactiveerd worden')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dossier: Record<string, any> | null = null
  let medewerker: {
    id: string
    auth_user_id: string | null
    in_dienst_vanaf: string | null
    uit_dienst_per: string | null
  } | null = null

  if (input.dossier_id) {
    // Haal dossier op voor rol-resolutie (as any: extra rol-kolommen niet in gegenereerde types)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('dossiers')
      .select(`${DOSSIER_ROL_SELECT}, verwacht_startdatum, verwacht_einddatum`)
      .eq('id', input.dossier_id)
      .single()
    if (error || !data) throw new Error('Dossier niet gevonden')
    dossier = data
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('medewerkers')
      .select('id, auth_user_id, in_dienst_vanaf, uit_dienst_per')
      .eq('id', input.medewerker_id)
      .single()
    if (error || !data) throw new Error('Medewerker niet gevonden')
    medewerker = data
  }

  // Alleen gevuld bij handmatig activeren; op de trigger-route is er niemand die de
  // dialoog invult. Taken die dan tóch een deadline moeten krijgen hangen aan een
  // dossier-datum (verwacht_startdatum/verwacht_einddatum) in plaats van hieraan.
  const streefdatum = input.streefdatum ?? null

  // Haal alle taken op uit het sjabloon (incl. toewijzingen)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sjabloonTaken } = await (supabase as any)
    .from('tasks')
    .select('*, task_assignees(*), task_completion_acties(*)')
    .eq('lijst_id', input.template_id)
    .order('volgorde')

  // Maak nieuwe (instantie-)lijst aan
  const vandaag = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: nieuweLijst, error: lijstError } = await (supabase as any)
    .from('task_lists')
    .insert({
      naam:          sjabloon.naam,
      beschrijving:  sjabloon.beschrijving,
      is_template:   false,
      dossier_id:    input.dossier_id ?? null,
      medewerker_id: input.medewerker_id ?? null,
      context:       sjabloonContext,
      template_id:   input.template_id,
      owner_id:      (sjabloon as any).owner_id,
      volgorde:      0,
      // Vastleggen op de lijst: anders is een ingetypte streefdatum na dit request weg
      // en valt er later niets meer te herberekenen.
      streefdatum,
    })
    .select('id')
    .single()

  if (lijstError || !nieuweLijst) throw new Error(`Fout bij aanmaken instantie: ${lijstError?.message}`)

  // Kopieer taken (oud→nieuw id-map zodat parent_task_id van subtaken na afloop
  // geremapt kan worden naar de nieuwe taken — anders verliezen subtaken hun hiërarchie).
  const idMap = new Map<string, string>()
  for (const taak of sjabloonTaken ?? []) {
    // Herhalende taken worden niet één keer gekloond maar als reeks opgebouwd zodra
    // het uitvoeringsvenster bekend is; dat doet herberekenDossierNu hieronder.
    if ((taak.herhaling_interval ?? 'geen') !== 'geen') continue

    const deadline = berekenDeadline(taak.deadline_basis, taak.deadline_dagen, {
      activatiedatum: vandaag,
      streefdatum,
      verwacht_startdatum: dossier?.verwacht_startdatum ?? null,
      verwacht_einddatum:  dossier?.verwacht_einddatum ?? null,
      in_dienst_vanaf:     medewerker?.in_dienst_vanaf ?? null,
      uit_dienst_per:      medewerker?.uit_dienst_per ?? null,
    })

    // Voeg taak in
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nieuweTaak, error: taakError } = await (supabase as any)
      .from('tasks')
      .insert({
        lijst_id:              nieuweLijst.id,
        titel:                 taak.titel,
        omschrijving:          taak.omschrijving,
        status:                'open',
        prioriteit:            taak.prioriteit,
        deadline,
        // Anker meenemen zodat een planning-gebonden deadline later kan meebewegen.
        deadline_basis:        taak.deadline_basis ?? 'geen',
        deadline_dagen:        taak.deadline_dagen ?? null,
        geschatte_uren:        taak.geschatte_uren,
        volgorde:              taak.volgorde,
        assignee_type:         taak.assignee_type ?? 'direct',
        dossier_rollen:        taak.dossier_rollen ?? [],
        formulier_template_id: taak.formulier_template_id ?? null,
        aangemaakt_door:       null,
      })
      .select('id')
      .single()

    if (taakError || !nieuweTaak) continue
    idMap.set(taak.id, nieuweTaak.id)

    await resolveerToewijzingen(
      supabase,
      { dossier: dossier ?? undefined, medewerker: medewerker ?? undefined },
      taak,
      nieuweTaak.id,
    )
    await kopieerCompletionActies(supabase, taak, nieuweTaak.id)
  }

  // Pass 2: taak-relaties (parent_task_id + blocked_by_task_id) remappen naar de gekopieerde taken.
  for (const taak of sjabloonTaken ?? []) {
    if (!taak.parent_task_id && !taak.blocked_by_task_id) continue
    const nieuwId = idMap.get(taak.id)
    if (!nieuwId) continue
    const patch: Record<string, string> = {}
    if (taak.parent_task_id) {
      const nieuwParentId = idMap.get(taak.parent_task_id)
      if (nieuwParentId) patch.parent_task_id = nieuwParentId
    }
    if (taak.blocked_by_task_id) {
      const nieuwBlockerId = idMap.get(taak.blocked_by_task_id)
      if (nieuwBlockerId) patch.blocked_by_task_id = nieuwBlockerId
    }
    if (Object.keys(patch).length > 0) {
      await (supabase as any).from('tasks').update(patch).eq('id', nieuwId)
    }
  }

  // Planning-gebonden deadlines uitrekenen en de herhalende taken opbouwen.
  // Staat er nog geen detailplanning, dan gebeurt dat later alsnog via de wachtrij.
  // Medewerker-context kent geen planningvenster of herhaling; daar is niets na te rekenen.
  if (input.dossier_id) {
    await herberekenDossierNu(input.dossier_id)
  }

  revalidatePath('/taken/lijsten')
  revalidatePath(`/taken/lijsten/${nieuweLijst.id}`)
  if (input.medewerker_id) revalidatePath(`/medewerkers/${input.medewerker_id}`)

  return { lijst_id: nieuweLijst.id }
}

// ─── Sjabloon kopiëren ────────────────────────────────────────────────────────

/**
 * Maak een kopie van een actielijst (incl. taken, toewijzingen en voltooiingsacties).
 * Triggers worden bewust NIET meegekopieerd: het doel van een kopie is een variant
 * met andere triggers, en meekopiëren zou dubbel vuren op dezelfde events.
 * blocked_by_task_id wordt geremapt naar de gekopieerde taken.
 */
export async function kopieerActielijst(bron_id: string): Promise<{ id: string }> {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: bron, error: bronError } = await sb
    .from('task_lists')
    .select('*')
    .eq('id', bron_id)
    .single()
  if (bronError || !bron) throw new Error('Actielijst niet gevonden')

  const { data: bronTaken } = await sb
    .from('tasks')
    .select('*, task_assignees(*), task_completion_acties(*)')
    .eq('lijst_id', bron_id)
    .order('volgorde')

  const { data: nieuweLijst, error: lijstError } = await sb
    .from('task_lists')
    .insert({
      naam:             `${bron.naam} (kopie)`,
      beschrijving:     bron.beschrijving,
      is_template:   true,
      template_naam: bron.template_naam ? `${bron.template_naam} (kopie)` : null,
      context:       bron.context ?? 'dossier',
      owner_id:      user.id,
      volgorde:      0,
    })
    .select('id')
    .single()
  if (lijstError || !nieuweLijst) throw new Error(`Fout bij kopiëren: ${lijstError?.message}`)

  // Pass 1: taken kopiëren en oud→nieuw id-map opbouwen
  const idMap = new Map<string, string>()
  for (const taak of bronTaken ?? []) {
    const { data: nieuweTaak, error: taakError } = await sb
      .from('tasks')
      .insert({
        lijst_id:               nieuweLijst.id,
        titel:                  taak.titel,
        omschrijving:           taak.omschrijving,
        status:                 'open',
        prioriteit:             taak.prioriteit,
        deadline:               taak.deadline,
        geschatte_uren:         taak.geschatte_uren,
        volgorde:               taak.volgorde,
        assignee_type:          taak.assignee_type ?? 'direct',
        dossier_rollen:         taak.dossier_rollen ?? [],
        deadline_basis:         taak.deadline_basis ?? 'geen',
        deadline_dagen:         taak.deadline_dagen ?? null,
        herhaling_interval:     taak.herhaling_interval ?? 'geen',
        formulier_template_id:  taak.formulier_template_id ?? null,
        aangemaakt_door:        user.id,
      })
      .select('id')
      .single()
    if (taakError || !nieuweTaak) continue
    idMap.set(taak.id, nieuweTaak.id)

    const assignees = taak.task_assignees ?? []
    if (assignees.length > 0) {
      await sb.from('task_assignees').insert(
        assignees.map((a: { user_id: string; rol: string }) => ({
          task_id: nieuweTaak.id,
          user_id: a.user_id,
          rol:     a.rol,
        })),
      )
    }

    const acties = taak.task_completion_acties ?? []
    if (acties.length > 0) {
      await sb.from('task_completion_acties').insert(
        acties.map((a: { actie_type: string; config: unknown; volgorde: number }) => ({
          task_id:    nieuweTaak.id,
          actie_type: a.actie_type,
          config:     a.config,
          volgorde:   a.volgorde,
        })),
      )
    }
  }

  // Pass 2: taak-relaties (blocked_by + parent_task_id) remappen naar de nieuwe taken.
  for (const taak of bronTaken ?? []) {
    if (!taak.blocked_by_task_id && !taak.parent_task_id) continue
    const nieuwId = idMap.get(taak.id)
    if (!nieuwId) continue
    const patch: Record<string, string> = {}
    if (taak.blocked_by_task_id) {
      const nieuwBlockerId = idMap.get(taak.blocked_by_task_id)
      if (nieuwBlockerId) patch.blocked_by_task_id = nieuwBlockerId
    }
    if (taak.parent_task_id) {
      const nieuwParentId = idMap.get(taak.parent_task_id)
      if (nieuwParentId) patch.parent_task_id = nieuwParentId
    }
    if (Object.keys(patch).length > 0) {
      await sb.from('tasks').update(patch).eq('id', nieuwId)
    }
  }

  revalidatePath('/taken/lijsten')
  return { id: nieuweLijst.id }
}

// ─── Auto-trigger: verwerk openstaande activeringen ───────────────────────────

/**
 * Verwerk de 'pending' rijen in actielijst_activeringen die de DB-trigger
 * (tg_dossier_enqueue_activeringen) heeft aangemaakt bij een dossierstatus-wijziging.
 *
 * De DB beslist write-path-agnostisch wélke sjablonen geactiveerd moeten worden
 * (Kanban, Bouw7-sync, externe DB-writes, INSERT); deze functie voert ze idempotent
 * uit door per rij het sjabloon te klonen via activeerSjabloon.
 *
 * Optioneel gefilterd op één dossier (voor directe UX bij een statuswijziging in de app);
 * zonder argument worden alle openstaande activeringen verwerkt (bv. na een Bouw7-sync).
 *
 * Claim-first (status 'processing') voorkomt dat twee gelijktijdige drains dezelfde rij
 * verwerken; de UNIQUE(template_id, dossier_id)-constraint is het uiteindelijke vangnet.
 */
export async function verwerkActiveringen(dossier_id?: string, medewerker_id?: string): Promise<number> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  let query = sb
    .from('actielijst_activeringen')
    .select('id, template_id, dossier_id, medewerker_id')
    .eq('status', 'pending')
  if (dossier_id) query = query.eq('dossier_id', dossier_id)
  if (medewerker_id) query = query.eq('medewerker_id', medewerker_id)

  const { data: rijen } = await query
  if (!rijen?.length) return 0

  let verwerkt = 0
  for (const rij of rijen as { id: string; template_id: string; dossier_id: string | null; medewerker_id: string | null }[]) {
    // Claim de rij; als een andere drain hem al claimde, krijgen we 0 rijen terug.
    const { data: geclaimd } = await sb
      .from('actielijst_activeringen')
      .update({ status: 'processing' })
      .eq('id', rij.id)
      .eq('status', 'pending')
      .select('id')
    if (!geclaimd?.length) continue

    try {
      const { lijst_id } = await activeerSjabloon({
        template_id:   rij.template_id,
        dossier_id:    rij.dossier_id ?? undefined,
        medewerker_id: rij.medewerker_id ?? undefined,
      })
      await sb
        .from('actielijst_activeringen')
        .update({ status: 'done', lijst_id, verwerkt_op: new Date().toISOString() })
        .eq('id', rij.id)
      verwerkt++
    } catch (e) {
      await sb
        .from('actielijst_activeringen')
        .update({
          status:      'error',
          foutmelding: e instanceof Error ? e.message : String(e),
          verwerkt_op: new Date().toISOString(),
        })
        .eq('id', rij.id)
    }
  }
  return verwerkt
}

// ─── IFTTT: trigger-evaluatie ─────────────────────────────────────────────────

const ROL_KOLOMMEN = [
  'project_manager_id', 'teamleider_id', 'werkvoorbereider_id',
  'uitvoerder_id', 'controller_id', 'calculator_id',
] as const

const CONDITIE_VELD_WHITELIST = [
  'categorie', 'bouw7_categorie_naam', 'bedrag_excl_btw',
  'hoofdstatus', 'actieve_substatus', 'servicedesk_substatus',
] as const

export interface ActielijstTrigger {
  id: string
  template_id: string
  event_type: string
  event_config: Record<string, unknown>
  condities: TriggerConditie[]
  /** Hoe de condities gecombineerd worden: 'en' = alle, 'of' = ten minste één. */
  conditie_logica?: 'en' | 'of'
  actief: boolean
  volgorde: number
}

export interface TriggerConditie {
  soort: 'veld' | 'klant' | 'relatie_type' | 'toggle'
  veld?: string
  op?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  waarde?: string | number
  klant_id?: string
  /** Alleen voor weergave in de editor; de evaluator gebruikt klant_id. */
  klant_naam?: string
  toggle_sleutel?: string
  aan?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Snapshot = Record<string, any> | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface TriggerEvent { id: string; dossier_id: string; soort: string; payload: Record<string, any> }

function vergelijk(a: unknown, b: unknown, op: string): boolean {
  switch (op) {
    case 'eq':  return a === b
    case 'neq': return a !== b
    case 'gt':  return Number(a) >  Number(b)
    case 'gte': return Number(a) >= Number(b)
    case 'lt':  return Number(a) <  Number(b)
    case 'lte': return Number(a) <= Number(b)
    default:    return false
  }
}

/** Bepaalt of een trigger-regel matcht met het gebeurde event (delta-detectie). */
function matchEvent(
  trigger: ActielijstTrigger,
  event: TriggerEvent,
  toggleSleutelById: Map<string, string>,
): boolean {
  const cfg = trigger.event_config ?? {}
  const { soort, payload } = event
  const oud: Snapshot = payload?.oud ?? null
  const nieuw: Snapshot = payload?.nieuw ?? null
  const isDossier = soort === 'dossier_insert' || soort === 'dossier_update'

  switch (trigger.event_type) {
    case 'dossier_status': {
      if (!isDossier || !nieuw) return false
      if (nieuw.hoofdstatus !== cfg.hoofdstatus) return false
      if (cfg.substatus && nieuw.actieve_substatus !== cfg.substatus) return false
      // "Bereikt": bij update moet de status-tuple gewijzigd zijn t.o.v. oud.
      if (soort === 'dossier_update' && oud
          && oud.hoofdstatus === nieuw.hoofdstatus
          && oud.actieve_substatus === nieuw.actieve_substatus) return false
      return true
    }
    case 'dossier_aangemaakt': {
      if (soort !== 'dossier_insert') return false
      if (cfg.hoofdstatus && nieuw?.hoofdstatus !== cfg.hoofdstatus) return false
      return true
    }
    case 'rol_toegewezen': {
      if (!isDossier) return false
      const rol = cfg.rol as string
      if (!ROL_KOLOMMEN.includes(rol as typeof ROL_KOLOMMEN[number])) return false
      return !!nieuw?.[rol] && !oud?.[rol]
    }
    case 'veld_waarde': {
      if (!isDossier) return false
      const veld = cfg.veld as string
      if (veld !== 'categorie' && veld !== 'bouw7_categorie_naam') return false
      if (nieuw?.[veld] !== cfg.waarde) return false
      if (soort === 'dossier_update' && oud?.[veld] === nieuw?.[veld]) return false
      return true
    }
    case 'bedrag_drempel': {
      if (!isDossier) return false
      const drempel = Number(cfg.drempel)
      const nieuwB = nieuw?.bedrag_excl_btw
      const oudB = oud?.bedrag_excl_btw
      if (nieuwB == null) return false
      return (oudB == null || Number(oudB) < drempel) && Number(nieuwB) >= drempel
    }
    case 'toggle_aan': {
      if (soort !== 'toggle') return false
      if (!payload?.nieuw_aan || payload?.oud_aan) return false
      return toggleSleutelById.get(payload.definitie_id) === cfg.toggle_sleutel
    }
    default: return false
  }
}

interface DossierContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dossier: Record<string, any>
  relatieTypes: string[]
  toggles: Map<string, boolean>
}

/** Test één conditie tegen de dossiercontext. Velden via whitelist. */
function evalConditie(c: TriggerConditie, ctx: DossierContext): boolean {
  switch (c.soort) {
    case 'veld':
      if (!CONDITIE_VELD_WHITELIST.includes(c.veld as typeof CONDITIE_VELD_WHITELIST[number])) return false
      return vergelijk(ctx.dossier[c.veld!], c.waarde, c.op ?? 'eq')
    case 'klant':
      return ctx.dossier.klant_id === c.klant_id
    case 'relatie_type': {
      // relaties.types is een array; eq = bevat de waarde, neq = bevat de waarde niet.
      const bevat = ctx.relatieTypes.includes(String(c.waarde))
      return (c.op ?? 'eq') === 'neq' ? !bevat : bevat
    }
    case 'toggle':
      return (ctx.toggles.get(c.toggle_sleutel ?? '') ?? false) === (c.aan ?? true)
    default: return false
  }
}

/**
 * Combineert de condities volgens de trigger-logica (lege lijst = altijd waar).
 * 'en' = alle condities moeten kloppen, 'of' = ten minste één.
 */
function evalCondities(
  condities: TriggerConditie[],
  logica: 'en' | 'of' = 'en',
  test: (c: TriggerConditie) => boolean,
): boolean {
  if (!Array.isArray(condities) || condities.length === 0) return true
  return logica === 'of' ? condities.some(test) : condities.every(test)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function laadDossierContext(sb: any, dossier_id: string): Promise<DossierContext | null> {
  const { data: d } = await sb
    .from('dossiers')
    .select('id, hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus, categorie, bouw7_categorie_naam, bedrag_excl_btw, klant_id')
    .eq('id', dossier_id)
    .maybeSingle()
  if (!d) return null

  const actieve_substatus =
    d.hoofdstatus === 'aanvraag' ? d.aanvraag_substatus
    : d.hoofdstatus === 'offerte'  ? d.offerte_substatus
    : d.hoofdstatus === 'opdracht' ? d.opdracht_substatus
    : d.servicedesk_substatus

  let relatieTypes: string[] = []
  if (d.klant_id) {
    const { data: r } = await sb.from('relaties').select('types').eq('id', d.klant_id).maybeSingle()
    relatieTypes = Array.isArray(r?.types) ? r.types : []
  }

  const { data: tog } = await sb
    .from('dossier_toggles')
    .select('aan, dossier_toggle_definities(sleutel)')
    .eq('dossier_id', dossier_id)
  const toggles = new Map<string, boolean>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (tog ?? []) as any[]) {
    const sleutel = row.dossier_toggle_definities?.sleutel
    if (sleutel) toggles.set(sleutel, row.aan)
  }

  return { dossier: { ...d, actieve_substatus }, relatieTypes, toggles }
}

/**
 * Verwerk openstaande dossier-trigger-events: evalueer alle actieve trigger-regels
 * (event-match + AND-condities) en enqueue matchende activeringen, daarna klonen.
 *
 * De DB-triggers (tg_dossier_trigger_events / tg_dossier_toggle_events) signaleren
 * write-path-agnostisch dát er iets wijzigde; deze evaluator beslist wélke sjablonen
 * activeren. Idempotentie blijft "één keer per (template, dossier)" via de UNIQUE op
 * actielijst_activeringen; niet-matchende triggers laten geen rij achter (her-evaluatie mogelijk).
 */
export async function verwerkDossierTriggers(dossier_id?: string): Promise<number> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  let q = sb
    .from('dossier_trigger_events')
    .select('id, dossier_id, soort, payload')
    .eq('status', 'pending')
    .order('created_at')
  if (dossier_id) q = q.eq('dossier_id', dossier_id)
  const { data: events } = await q

  if (events?.length) {
    const { data: defs } = await sb.from('dossier_toggle_definities').select('id, sleutel')
    const toggleSleutelById = new Map<string, string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (defs ?? []).map((d: any) => [d.id, d.sleutel]),
    )

    for (const ev of events as TriggerEvent[]) {
      // Claim het event (voorkomt dubbele verwerking door gelijktijdige drains).
      const { data: claimed } = await sb
        .from('dossier_trigger_events')
        .update({ status: 'processing' })
        .eq('id', ev.id)
        .eq('status', 'pending')
        .select('id')
      if (!claimed?.length) continue

      try {
        const ctx = await laadDossierContext(sb, ev.dossier_id)
        if (ctx) {
          const { data: triggers } = await sb
            .from('actielijst_triggers')
            .select('id, template_id, event_type, event_config, condities, conditie_logica, actief')
            .eq('actief', true)

          for (const t of (triggers ?? []) as ActielijstTrigger[]) {
            if (matchEvent(t, ev, toggleSleutelById) && evalCondities(t.condities ?? [], t.conditie_logica ?? 'en', c => evalConditie(c, ctx))) {
              // ON CONFLICT DO NOTHING via upsert ignoreDuplicates → idempotent.
              await sb
                .from('actielijst_activeringen')
                .upsert(
                  { dossier_id: ev.dossier_id, template_id: t.template_id, status: 'pending', bron: 'trigger' },
                  { onConflict: 'template_id,dossier_id', ignoreDuplicates: true },
                )
            }
          }
        }
        await sb.from('dossier_trigger_events')
          .update({ status: 'done', verwerkt_op: new Date().toISOString() })
          .eq('id', ev.id)
      } catch (e) {
        await sb.from('dossier_trigger_events')
          .update({ status: 'error', foutmelding: e instanceof Error ? e.message : String(e), verwerkt_op: new Date().toISOString() })
          .eq('id', ev.id)
      }
    }
  }

  // Kloon de zojuist (of eerder) ge-enqueuede activeringen.
  return verwerkActiveringen(dossier_id)
}

// ─── IFTTT: medewerker-triggers ───────────────────────────────────────────────
// Spiegel van de dossier-evaluator hierboven, maar dan voor sjablonen met
// context='medewerker'. Events komen uit medewerker_trigger_events (DB-triggers
// op medewerkers en medewerker_attribuut_waarden, zie migratie 20260720b).

// Niet exporteren: een 'use server'-bestand mag alleen async functies exporteren.
// De trigger-editor heeft zijn eigen (gelabelde) lijst — houd beide in sync.
const MEDEWERKER_EVENT_TYPES = [
  'medewerker_aangemaakt', 'medewerker_veld_waarde', 'medewerker_datum_gezet', 'medewerker_attribuut',
] as const

const MEDEWERKER_CONDITIE_VELDEN = ['functie', 'afdeling', 'actief', 'extern'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface MedewerkerTriggerEvent { id: string; medewerker_id: string; soort: string; payload: Record<string, any> }

/** Bepaalt of een medewerker-trigger-regel matcht met het gebeurde event (delta-detectie). */
function matchMedewerkerEvent(trigger: ActielijstTrigger, event: MedewerkerTriggerEvent): boolean {
  const cfg = trigger.event_config ?? {}
  const { soort, payload } = event
  const oud: Snapshot = payload?.oud ?? null
  const nieuw: Snapshot = payload?.nieuw ?? null
  const isMedewerker = soort === 'medewerker_insert' || soort === 'medewerker_update'

  switch (trigger.event_type) {
    case 'medewerker_aangemaakt':
      return soort === 'medewerker_insert'
    case 'medewerker_veld_waarde': {
      if (!isMedewerker || !nieuw) return false
      const veld = cfg.veld as string
      if (!MEDEWERKER_CONDITIE_VELDEN.includes(veld as typeof MEDEWERKER_CONDITIE_VELDEN[number])) return false
      // String-vergelijk zodat booleans ('true'/'false' uit de UI) ook matchen.
      if (String(nieuw[veld]) !== String(cfg.waarde)) return false
      if (soort === 'medewerker_update' && oud && String(oud[veld]) === String(nieuw[veld])) return false
      return true
    }
    case 'medewerker_datum_gezet': {
      // "Gezet of gewijzigd": ook bij aanmaken mét datum (bv. in_dienst_vanaf bij een
      // nieuwe medewerker) — anders zou een onboarding-checklist die insert missen.
      if (!isMedewerker || !nieuw) return false
      const veld = cfg.veld as string
      if (veld !== 'in_dienst_vanaf' && veld !== 'uit_dienst_per') return false
      return nieuw[veld] != null && (oud?.[veld] ?? null) !== nieuw[veld]
    }
    case 'medewerker_attribuut': {
      if (soort !== 'attribuut') return false
      if (payload?.definitie_id !== cfg.definitie_id) return false
      const nieuwW = payload?.nieuw_waarde ?? null
      const oudW = payload?.oud_waarde ?? null
      if (nieuwW == null || nieuwW === '' || nieuwW === oudW) return false
      // Zonder opgegeven waarde: "krijgt een (andere) waarde"; met waarde: exacte match.
      if (cfg.waarde != null && cfg.waarde !== '' && String(nieuwW) !== String(cfg.waarde)) return false
      return true
    }
    default: return false
  }
}

interface MedewerkerContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  medewerker: Record<string, any>
}

/** Test één conditie tegen de medewerker. Alleen 'veld'-condities zijn zinvol in deze context. */
function evalMedewerkerConditie(c: TriggerConditie, ctx: MedewerkerContext): boolean {
  if (c.soort !== 'veld') return false
  if (!MEDEWERKER_CONDITIE_VELDEN.includes(c.veld as typeof MEDEWERKER_CONDITIE_VELDEN[number])) return false
  const op = c.op ?? 'eq'
  // String-normalisatie voor eq/neq (booleans); gt/lt e.d. rekenen numeriek in vergelijk().
  if (op === 'eq' || op === 'neq') return vergelijk(String(ctx.medewerker[c.veld!]), String(c.waarde), op)
  return vergelijk(ctx.medewerker[c.veld!], c.waarde, op)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function laadMedewerkerContext(sb: any, medewerker_id: string): Promise<MedewerkerContext | null> {
  const { data: m } = await sb
    .from('medewerkers')
    .select('id, actief, extern, functie, afdeling, in_dienst_vanaf, uit_dienst_per')
    .eq('id', medewerker_id)
    .maybeSingle()
  if (!m) return null
  return { medewerker: m }
}

/**
 * Verwerk openstaande medewerker-trigger-events: evalueer de actieve medewerker-
 * trigger-regels en enqueue matchende activeringen, daarna klonen. Idempotentie
 * via UNIQUE(template_id, medewerker_id) op actielijst_activeringen.
 */
export async function verwerkMedewerkerTriggers(medewerker_id?: string): Promise<number> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  let q = sb
    .from('medewerker_trigger_events')
    .select('id, medewerker_id, soort, payload')
    .eq('status', 'pending')
    .order('created_at')
  if (medewerker_id) q = q.eq('medewerker_id', medewerker_id)
  const { data: events } = await q

  if (events?.length) {
    for (const ev of events as MedewerkerTriggerEvent[]) {
      // Claim het event (voorkomt dubbele verwerking door gelijktijdige drains).
      const { data: claimed } = await sb
        .from('medewerker_trigger_events')
        .update({ status: 'processing' })
        .eq('id', ev.id)
        .eq('status', 'pending')
        .select('id')
      if (!claimed?.length) continue

      try {
        const ctx = await laadMedewerkerContext(sb, ev.medewerker_id)
        if (ctx) {
          const { data: triggers } = await sb
            .from('actielijst_triggers')
            .select('id, template_id, event_type, event_config, condities, conditie_logica, actief')
            .eq('actief', true)
            .in('event_type', [...MEDEWERKER_EVENT_TYPES])

          for (const t of (triggers ?? []) as ActielijstTrigger[]) {
            if (matchMedewerkerEvent(t, ev) && evalCondities(t.condities ?? [], t.conditie_logica ?? 'en', c => evalMedewerkerConditie(c, ctx))) {
              await sb
                .from('actielijst_activeringen')
                .upsert(
                  { medewerker_id: ev.medewerker_id, template_id: t.template_id, status: 'pending', bron: 'trigger' },
                  { onConflict: 'template_id,medewerker_id', ignoreDuplicates: true },
                )
            }
          }
        }
        await sb.from('medewerker_trigger_events')
          .update({ status: 'done', verwerkt_op: new Date().toISOString() })
          .eq('id', ev.id)
      } catch (e) {
        await sb.from('medewerker_trigger_events')
          .update({ status: 'error', foutmelding: e instanceof Error ? e.message : String(e), verwerkt_op: new Date().toISOString() })
          .eq('id', ev.id)
      }
    }
  }

  return verwerkActiveringen(undefined, medewerker_id)
}

/** Keuzelijsten voor de medewerker-trigger-editor (functies, afdelingen, custom velden). */
export async function getMedewerkerTriggerRefData(): Promise<{
  functies: string[]
  afdelingen: string[]
  attributen: { id: string; naam: string }[]
}> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [f, a, d] = await Promise.all([
    sb.from('medewerker_functies').select('naam').eq('actief', true).order('volgorde').order('naam'),
    sb.from('medewerker_afdelingen').select('naam').eq('actief', true).order('volgorde').order('naam'),
    sb.from('medewerker_attribuut_definities').select('id, naam').eq('actief', true).order('volgorde'),
  ])

  return {
    functies:   ((f.data ?? []) as { naam: string }[]).map(r => r.naam),
    afdelingen: ((a.data ?? []) as { naam: string }[]).map(r => r.naam),
    attributen: (d.data ?? []) as { id: string; naam: string }[],
  }
}

// ─── CRUD: trigger-regels per sjabloon ────────────────────────────────────────

export async function getTriggersVoorSjabloon(template_id: string): Promise<ActielijstTrigger[]> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('actielijst_triggers')
    .select('*')
    .eq('template_id', template_id)
    .order('volgorde')
  return (data ?? []) as ActielijstTrigger[]
}

export async function upsertTrigger(input: {
  id?: string
  template_id: string
  event_type: string
  event_config: Record<string, unknown>
  condities: TriggerConditie[]
  conditie_logica?: 'en' | 'of'
  volgorde?: number
  actief?: boolean
}): Promise<{ id: string }> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const payload = {
    template_id:     input.template_id,
    event_type:      input.event_type,
    event_config:    input.event_config,
    condities:       input.condities,
    conditie_logica: input.conditie_logica ?? 'en',
    volgorde:        input.volgorde ?? 0,
    actief:          input.actief ?? true,
  }

  if (input.id) {
    const { error } = await sb.from('actielijst_triggers').update(payload).eq('id', input.id)
    if (error) throw new Error(error.message)
    revalidatePath(`/taken/lijsten/${input.template_id}`)
    return { id: input.id }
  }

  const { data, error } = await sb.from('actielijst_triggers').insert(payload).select('id').single()
  if (error) throw new Error(error.message)
  revalidatePath(`/taken/lijsten/${input.template_id}`)
  return { id: data.id }
}

export async function verwijderTrigger(id: string, template_id: string): Promise<void> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('actielijst_triggers').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/taken/lijsten/${template_id}`)
}

// ─── Medewerkers voor toewijzing ──────────────────────────────────────────────

export interface MedewerkerKeuze {
  id: string
  auth_user_id: string | null
  naam: string
}

export async function getMedewerkersVoorToewijzing(): Promise<MedewerkerKeuze[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('medewerkers')
    .select('id, auth_user_id, voornaam, tussenvoegsel, achternaam')
    .eq('actief', true)
    .order('achternaam')

  return (data ?? []).map((m: {
    id: string
    auth_user_id: string | null
    voornaam: string
    tussenvoegsel: string | null
    achternaam: string
  }) => ({
    id:           m.id,
    auth_user_id: m.auth_user_id,
    naam:         [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
  }))
}

// ─── Sjablonen ophalen (voor client-components zoals TaakCompletionActies) ───

export async function getSjablonen(context?: 'dossier' | 'medewerker'): Promise<DbTaskList[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('task_lists')
    .select('*')
    .eq('is_template', true)
    .order('template_naam', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (context) query = (query as any).eq('context', context)
  const { data } = await query
  return (data ?? []) as DbTaskList[]
}

// ─── Completion-acties CRUD ───────────────────────────────────────────────────

export async function upsertCompletionActie(data: {
  id?: string
  task_id: string
  volgorde: number
  actie_type: CompletionActieType
  config: Record<string, unknown>
}): Promise<{ id: string }> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  if (data.id) {
    const { error } = await sb
      .from('task_completion_acties')
      .update({ volgorde: data.volgorde, actie_type: data.actie_type, config: data.config })
      .eq('id', data.id)
    if (error) throw new Error(error.message)
    revalidatePath('/taken')
    return { id: data.id }
  }

  const { data: row, error } = await sb
    .from('task_completion_acties')
    .insert({ task_id: data.task_id, volgorde: data.volgorde, actie_type: data.actie_type, config: data.config })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/taken')
  return { id: row.id }
}

export async function verwijderCompletionActie(id: string): Promise<void> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('task_completion_acties').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/taken')
}

export async function getCompletionActies(task_id: string): Promise<DbTaskCompletionActie[]> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('task_completion_acties')
    .select('*')
    .eq('task_id', task_id)
    .order('volgorde')
  return (data ?? []) as DbTaskCompletionActie[]
}
