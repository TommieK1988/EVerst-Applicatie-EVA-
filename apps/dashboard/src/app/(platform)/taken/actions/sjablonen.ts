'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import type {
  ActielijstMetTaken,
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

// ─── Auto-trigger: activeer sjablonen op basis van dossierstatus ──────────────

/**
 * Aanroepen vanuit updateDossierSubstatus.
 * Controleert of er sjablonen zijn geconfigureerd voor de gegeven dossierstatus
 * en activeert ze automatisch.
 */
export async function activeerSjablonenVoorStatus(input: {
  dossier_id: string
  hoofdstatus: string
  nieuwe_substatus: string
}): Promise<void> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sjablonen } = await (supabase as any)
    .from('task_lists')
    .select('id')
    .eq('is_template', true)
    .eq('trigger_hoofdstatus', input.hoofdstatus)
    .eq('trigger_substatus', input.nieuwe_substatus)

  for (const sjabloon of sjablonen ?? []) {
    await activeerSjabloon({
      template_id: sjabloon.id,
      dossier_id:  input.dossier_id,
    }).catch(() => {}) // individuele fouten blokkeren andere sjablonen niet
  }
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
