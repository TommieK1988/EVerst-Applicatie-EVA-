'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/taken/supabase/server'
import { createAdminClient } from '@everts/database/server'
import type {
  CompletionActieType,
  DbTaskCompletionActie,
  DbTaskList,
} from '@/lib/taken/supabase/database.types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDagen(isoDate: string, dagen: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + dagen)
  return d.toISOString().split('T')[0]
}

function subDagen(isoDate: string, dagen: number): string {
  return addDagen(isoDate, -dagen)
}

// ─── Sjabloon activeren ───────────────────────────────────────────────────────

/**
 * Kloon een sjabloon-actielijst naar een concrete instantie gekoppeld aan een dossier.
 * Resolveer dossier-rol toewijzingen naar echte medewerkers.
 * Als streefdatum is opgegeven, worden deadline_offset_dagen omgezet naar concrete deadlines.
 */
export async function activeerSjabloon(input: {
  template_id: string
  dossier_id: string
  streefdatum?: string
}): Promise<{ lijst_id: string }> {
  const supabase = createAdminClient()

  // Haal sjabloon op
  const { data: sjabloon, error: sjabloonError } = await supabase
    .from('task_lists')
    .select('*')
    .eq('id', input.template_id)
    .eq('is_template', true)
    .single()

  if (sjabloonError || !sjabloon) throw new Error('Sjabloon niet gevonden')

  // Haal dossier op voor rol-resolutie (as any: extra rol-kolommen niet in gegenereerde types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dossier, error: dossierError } = await (supabase as any)
    .from('dossiers')
    .select('id, project_manager_id, teamleider_id, werkvoorbereider_id, calculator_id, uitvoerder_id, controller_id')
    .eq('id', input.dossier_id)
    .single()

  if (dossierError || !dossier) throw new Error('Dossier niet gevonden')

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
      naam:         sjabloon.naam,
      beschrijving: sjabloon.beschrijving,
      is_template:  false,
      dossier_id:   input.dossier_id,
      template_id:  input.template_id,
      owner_id:     (sjabloon as any).owner_id,
      volgorde:     0,
    })
    .select('id')
    .single()

  if (lijstError || !nieuweLijst) throw new Error(`Fout bij aanmaken instantie: ${lijstError?.message}`)

  // Kopieer taken
  for (const taak of sjabloonTaken ?? []) {
    // Bereken deadline
    let deadline: string | null = null
    if (taak.max_doorlooptijd_dagen != null) {
      deadline = addDagen(vandaag, taak.max_doorlooptijd_dagen)
    } else if (taak.deadline_offset_dagen != null && input.streefdatum) {
      deadline = subDagen(input.streefdatum, taak.deadline_offset_dagen)
    }

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

    // Toewijzingen resolven
    const assignees = taak.task_assignees ?? []

    if (taak.assignee_type === 'dossier_rol' && (taak.dossier_rollen ?? []).length > 0) {
      // Resolveer elke rol naar een medewerker-id op het dossier
      for (const rol of taak.dossier_rollen as string[]) {
        const medewerkerIdOpDossier = (dossier as Record<string, unknown>)[rol] as string | null
        if (!medewerkerIdOpDossier) continue
        const { data: med } = await supabase
          .from('medewerkers')
          .select('auth_user_id')
          .eq('id', medewerkerIdOpDossier)
          .single()
        if (med?.auth_user_id) {
          await supabase.from('task_assignees').insert({
            task_id: nieuweTaak.id,
            user_id: med.auth_user_id,
            rol:     'verantwoordelijke',
          })
        }
      }
    } else if (assignees.length > 0) {
      // Kopieer directe toewijzingen
      await supabase.from('task_assignees').insert(
        assignees.map((a: { user_id: string; rol: string }) => ({
          task_id: nieuweTaak.id,
          user_id: a.user_id,
          rol:     a.rol,
        }))
      )
    }

    // Kopieer completion-acties
    const acties = taak.task_completion_acties ?? []
    if (acties.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('task_completion_acties').insert(
        acties.map((a: { actie_type: string; config: unknown; volgorde: number }) => ({
          task_id:     nieuweTaak.id,
          actie_type:  a.actie_type,
          config:      a.config,
          volgorde:    a.volgorde,
        }))
      )
    }
  }

  revalidatePath('/taken/lijsten')
  revalidatePath(`/taken/lijsten/${nieuweLijst.id}`)

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
      naam:          `${bron.naam} (kopie)`,
      beschrijving:  bron.beschrijving,
      is_template:   true,
      template_naam: bron.template_naam ? `${bron.template_naam} (kopie)` : null,
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
        max_doorlooptijd_dagen: taak.max_doorlooptijd_dagen,
        deadline_offset_dagen:  taak.deadline_offset_dagen,
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

  // Pass 2: taak-afhankelijkheden (blocked_by) remappen naar de nieuwe taken
  for (const taak of bronTaken ?? []) {
    if (!taak.blocked_by_task_id) continue
    const nieuwId        = idMap.get(taak.id)
    const nieuwBlockerId = idMap.get(taak.blocked_by_task_id)
    if (nieuwId && nieuwBlockerId) {
      await sb.from('tasks').update({ blocked_by_task_id: nieuwBlockerId }).eq('id', nieuwId)
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
export async function verwerkActiveringen(dossier_id?: string): Promise<number> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  let query = sb
    .from('actielijst_activeringen')
    .select('id, template_id, dossier_id')
    .eq('status', 'pending')
  if (dossier_id) query = query.eq('dossier_id', dossier_id)

  const { data: rijen } = await query
  if (!rijen?.length) return 0

  let verwerkt = 0
  for (const rij of rijen as { id: string; template_id: string; dossier_id: string }[]) {
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
        template_id: rij.template_id,
        dossier_id:  rij.dossier_id,
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
  actief: boolean
  volgorde: number
}

export interface TriggerConditie {
  soort: 'veld' | 'klant' | 'relatie_type' | 'toggle'
  veld?: string
  op?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  waarde?: string | number
  klant_id?: string
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

/** Alle AND-condities moeten waar zijn (lege lijst = altijd waar). Velden via whitelist. */
function evalCondities(condities: TriggerConditie[], ctx: DossierContext): boolean {
  if (!Array.isArray(condities) || condities.length === 0) return true
  return condities.every(c => {
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
  })
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
            .select('id, template_id, event_type, event_config, condities, actief')
            .eq('actief', true)

          for (const t of (triggers ?? []) as ActielijstTrigger[]) {
            if (matchEvent(t, ev, toggleSleutelById) && evalCondities(t.condities ?? [], ctx)) {
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
  volgorde?: number
  actief?: boolean
}): Promise<{ id: string }> {
  const supabase = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const payload = {
    template_id:  input.template_id,
    event_type:   input.event_type,
    event_config: input.event_config,
    condities:    input.condities,
    volgorde:     input.volgorde ?? 0,
    actief:       input.actief ?? true,
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

export async function getSjablonen(): Promise<DbTaskList[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('task_lists')
    .select('*')
    .eq('is_template', true)
    .order('template_naam', { ascending: true })
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
