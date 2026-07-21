'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/taken/supabase/server'
import { createAdminClient } from '@everts/database/server'
import { updateDossierSubstatus } from '@/lib/dossiers/actions'
import { spiegelTaakstatusNaarBouw7 } from '@/lib/bouw7/todo-write'
import { activeerSjabloon } from './sjablonen'
import { getTaak } from '@/lib/taken/services/taken'
import type { Json, TaskStatus, TaskPrioriteit, TaskAssigneeRol, EntityType, DbTaskCompletionActie, TaakMetDetails } from '@/lib/taken/supabase/database.types'
import type { DeadlineBasis, HerhalingInterval } from '@/lib/taken/deadlines'
import type { DossierSubstatus } from '@/components/dossiers/types'

// ─── Actielijsten ─────────────────────────────────────────────────────────────

export async function maakActielijst(formData: FormData): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const entityType = formData.get('entity_type') as EntityType | null
  const entityId   = formData.get('entity_id') as string | null

  const { data, error } = await supabase
    .from('task_lists')
    .insert({
      naam:          formData.get('naam') as string,
      beschrijving:  (formData.get('beschrijving') as string) || null,
      entity_type:   entityType || null,
      entity_id:     entityId   || null,
      is_template:   true, // actielijsten zijn altijd sjablonen (instanties ontstaan via activeerSjabloon)
      template_naam: (formData.get('template_naam') as string) || null,
      // Waar het sjabloon voor bedoeld is: een dossier of een medewerker.
      context:       formData.get('context') === 'medewerker' ? 'medewerker' : 'dossier',
      owner_id:      user.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken actielijst: ${error.message}`)

  revalidatePath('/taken')
  revalidatePath('/taken/lijsten')
  return { id: data.id }
}

/** Eén taak met details ophalen — client-aanroepbaar, voor het detailpaneel op de takenoverzichten. */
export async function haalTaakVoorPaneel(id: string): Promise<TaakMetDetails | null> {
  return getTaak(id)
}

export async function updateActielijst(id: string, formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const updateData: Record<string, unknown> = {
    naam:          formData.get('naam') as string,
    beschrijving:  (formData.get('beschrijving') as string) || null,
    updated_at:    new Date().toISOString(),
  }

  // Optionele velden alleen overschrijven als ze expliciet meegegeven zijn,
  // zodat bv. de hernoem-dialoog ze niet onbedoeld wist.
  if (formData.has('is_template'))   updateData.is_template   = formData.get('is_template') === 'true'
  if (formData.has('template_naam')) updateData.template_naam = (formData.get('template_naam') as string) || null
  if (formData.has('trigger_hoofdstatus') || formData.has('trigger_substatus')) {
    updateData.trigger_hoofdstatus = (formData.get('trigger_hoofdstatus') as string) || null
    updateData.trigger_substatus   = (formData.get('trigger_substatus')   as string) || null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('task_lists')
    .update(updateData)
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken actielijst: ${error.message}`)

  revalidatePath('/taken')
  revalidatePath('/taken/lijsten')
  revalidatePath(`/taken/lijsten/${id}`)
}

export async function verwijderActielijst(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const { error } = await supabase.from('task_lists').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen actielijst: ${error.message}`)

  revalidatePath('/taken')
  revalidatePath('/taken/lijsten')
}

// ─── Taken ────────────────────────────────────────────────────────────────────

export async function maakTaak(data: {
  titel: string
  lijst_id?: string
  /** Directe dossier-koppeling voor losse taken zonder actielijst. */
  dossier_id?: string
  /** Directe medewerker-koppeling voor losse taken zonder actielijst. */
  medewerker_id?: string
  beschrijving?: Record<string, unknown>
  status?: TaskStatus
  prioriteit?: TaskPrioriteit
  deadline?: string
  geschatte_uren?: number
  parent_task_id?: string
  assignees?: { user_id: string; rol?: TaskAssigneeRol }[]
  // Template-specifieke velden
  assignee_type?: 'direct' | 'dossier_rol' | 'medewerker_zelf'
  dossier_rollen?: string[]
  deadline_basis?: DeadlineBasis
  deadline_dagen?: number | null
  herhaling_interval?: HerhalingInterval
  // Formulier-koppeling
  formulier_template_id?: string
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: taak, error } = await (supabase as any).from('tasks').insert({
      titel:                  data.titel,
      lijst_id:               data.lijst_id               ?? null,
      dossier_id:             data.dossier_id             ?? null,
      medewerker_id:          data.medewerker_id          ?? null,
      omschrijving:           (data.beschrijving ?? null) as Json | null,
      status:                 data.status                 ?? 'open',
      prioriteit:             data.prioriteit             ?? 'normaal',
      deadline:               data.deadline               ?? null,
      geschatte_uren:         data.geschatte_uren         ?? null,
      parent_task_id:         data.parent_task_id         ?? null,
      aangemaakt_door:        user.id,
      assignee_type:          data.assignee_type          ?? 'direct',
      dossier_rollen:         data.dossier_rollen         ?? [],
      deadline_basis:         data.deadline_basis         ?? 'geen',
      deadline_dagen:         data.deadline_dagen         ?? null,
      deadline_handmatig:     data.deadline               != null,
      herhaling_interval:     data.herhaling_interval     ?? 'geen',
      formulier_template_id:  data.formulier_template_id  ?? null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken taak: ${error.message}`)

  // Toewijzingen vastleggen
  if (data.assignees?.length) {
    const { error: aError } = await supabase.from('task_assignees').insert(
      data.assignees.map(a => ({
        task_id: taak.id,
        user_id: a.user_id,
        rol:     a.rol ?? 'verantwoordelijke',
      }))
    )
    if (aError) throw new Error(`Fout bij toewijzen taak: ${aError.message}`)
  }

  // Audit log
  await supabase.from('task_audit_log').insert({
    task_id:      taak.id,
    user_id:      user.id,
    actie:        'aangemaakt',
    nieuwe_waarde: { titel: data.titel, status: data.status ?? 'open' },
  })

  revalidatePath('/taken')
  if (data.lijst_id) revalidatePath(`/taken/lijsten/${data.lijst_id}`)
  return { id: taak.id }
}

export async function updateTaakStatus(id: string, status: TaskStatus): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  // Haal dossier_id op (direct of via de lijst) zodat completion-acties het kunnen gebruiken
  const { data: oud } = await supabase
    .from('tasks')
    .select('status, lijst_id, dossier_id, blocked_by_task_id, task_lists(dossier_id)')
    .eq('id', id)
    .single()

  // Blokkering valideren bij activering
  if (['in_behandeling', 'gereed'].includes(status) && oud?.blocked_by_task_id) {
    const { data: blocker } = await supabase
      .from('tasks').select('status').eq('id', oud.blocked_by_task_id).single()
    if (blocker?.status !== 'gereed')
      throw new Error('Deze taak is geblokkeerd door een nog niet afgeronde taak.')
  }

  // Debiteuren-afdwingen: een >60-dagen debiteurentaak mag pas 'gereed' wanneer de verplichte
  // opvolging compleet is (reden, actie, actiehouder, verwachte betaaldatum, opvolgdatum + logboek).
  if (status === 'gereed') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: deb } = await admin
      .from('debiteuren')
      .select('id, status, vervaldatum, reden_code_id, actie, actiehouder_id, verwachte_betaaldatum, opvolgdatum')
      .eq('task_id', id)
      .maybeSingle()
    if (deb && deb.status === 'open' && deb.vervaldatum) {
      const dagenTeLaat = Math.floor((Date.now() - Date.parse(`${deb.vervaldatum}T00:00:00Z`)) / 86_400_000)
      if (dagenTeLaat > 60) {
        const veldenCompleet = !!deb.reden_code_id && !!(deb.actie ?? '').trim() && !!deb.actiehouder_id
          && !!deb.opvolgdatum
        let heeftLogboek = false
        if (veldenCompleet) {
          const { count } = await admin
            .from('debiteur_logboek').select('id', { count: 'exact', head: true }).eq('debiteur_id', deb.id)
          heeftLogboek = (count ?? 0) > 0
        }
        if (!veldenCompleet || !heeftLogboek) {
          throw new Error('Vul eerst reden, actie, actiehouder, opvolgdatum én een opmerking in voordat je deze debiteurentaak kunt afronden.')
        }
      }
    }
  }

  // Toolbox-afdwingen: een taak die aan een toolbox-toewijzing hangt mag niet
  // handmatig op 'gereed'. Hij sluit automatisch zodra de medewerker de toolbox
  // (slides + kennischeck + handtekening) op zijn telefoon heeft doorlopen.
  if (status === 'gereed') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: tb } = await admin
      .from('toolbox_toewijzingen')
      .select('status')
      .eq('task_id', id)
      .maybeSingle()
    if (tb && tb.status !== 'afgerond') {
      throw new Error('Deze taak wordt automatisch afgerond zodra je de toolbox op je telefoon hebt doorlopen.')
    }
  }

  const { error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken status: ${error.message}`)

  await supabase.from('task_audit_log').insert({
    task_id:      id,
    user_id:      user.id,
    actie:        'status_gewijzigd',
    oud_waarde:   { status: oud?.status },
    nieuwe_waarde: { status },
  })

  // Voltooiingsacties uitvoeren bij gereed
  if (status === 'gereed') {
    const dossierId = oud?.dossier_id
      ?? (oud?.task_lists as { dossier_id?: string } | null)?.dossier_id
      ?? null
    await verwerkVoltooiingsActies(id, dossierId).catch(() => {})
  }

  // Uit Bouw7 geïmporteerde taak → het vinkje ook daar zetten. Fail-soft: lukt de write niet,
  // dan blijft de EVA-status staan (de sync draait hem niet meer terug, zie tasks.bouw7_todo_done).
  await spiegelTaakstatusNaarBouw7(id, status).catch(() => {})

  revalidatePath('/taken')
  if (oud?.lijst_id) revalidatePath(`/taken/lijsten/${oud.lijst_id}`)
}

async function verwerkVoltooiingsActies(taakId: string, dossierId: string | null): Promise<void> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: acties } = await (supabase as any)
    .from('task_completion_acties')
    .select('*')
    .eq('task_id', taakId)
    .order('volgorde')

  for (const actie of (acties ?? []) as DbTaskCompletionActie[]) {
    const config = actie.config as Record<string, string>
    try {
      if (actie.actie_type === 'dossier_substatus_wijzigen' && dossierId && config.nieuwe_substatus) {
        await updateDossierSubstatus(dossierId, config.nieuwe_substatus as DossierSubstatus)
      } else if (actie.actie_type === 'dossier_rol_toewijzen' && dossierId && config.dossier_veld && config.medewerker_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('dossiers')
          .update({ [config.dossier_veld]: config.medewerker_id })
          .eq('id', dossierId)
        // De DB-trigger tg_dossier_rol_taken_reconcile koppelt wachtende dossier-rol-taken
        // automatisch aan de (nieuwe) rolhouder — ongeacht via welke weg de rol wijzigt.
      } else if (actie.actie_type === 'sjabloon_activeren' && dossierId && config.template_id) {
        await activeerSjabloon({ template_id: config.template_id, dossier_id: dossierId })
      }
    } catch {
      // individuele actie-fouten stoppen andere acties niet
    }
  }
}

export async function updateTaak(id: string, data: {
  titel?: string
  beschrijving?: Record<string, unknown>
  status?: TaskStatus
  prioriteit?: TaskPrioriteit
  deadline?: string | null
  geschatte_uren?: number | null
  assignee_type?: 'direct' | 'dossier_rol' | 'medewerker_zelf'
  dossier_rollen?: string[]
  deadline_basis?: DeadlineBasis
  deadline_dagen?: number | null
  herhaling_interval?: HerhalingInterval
  blocked_by_task_id?: string | null
  formulier_template_id?: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const { data: oud } = await supabase
    .from('tasks').select('*').eq('id', id).single()

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.titel               !== undefined) updatePayload.titel                = data.titel
  if (data.beschrijving        !== undefined) updatePayload.omschrijving         = data.beschrijving as Json
  if (data.status              !== undefined) updatePayload.status               = data.status
  if (data.prioriteit          !== undefined) updatePayload.prioriteit           = data.prioriteit
  if (data.deadline            !== undefined) {
    updatePayload.deadline = data.deadline
    // Zelf een datum kiezen zet de automatische berekening voor deze taak uit;
    // het veld leegmaken geeft de regie terug aan het anker.
    updatePayload.deadline_handmatig = data.deadline != null
  }
  if (data.geschatte_uren      !== undefined) updatePayload.geschatte_uren       = data.geschatte_uren
  if (data.assignee_type       !== undefined) updatePayload.assignee_type        = data.assignee_type
  if (data.dossier_rollen      !== undefined) updatePayload.dossier_rollen       = data.dossier_rollen ?? []
  if (data.deadline_basis      !== undefined) updatePayload.deadline_basis       = data.deadline_basis
  if (data.deadline_dagen      !== undefined) updatePayload.deadline_dagen       = data.deadline_dagen
  if (data.herhaling_interval  !== undefined) updatePayload.herhaling_interval   = data.herhaling_interval
  if (data.blocked_by_task_id      !== undefined) updatePayload.blocked_by_task_id      = data.blocked_by_task_id
  if (data.formulier_template_id  !== undefined) updatePayload.formulier_template_id  = data.formulier_template_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('tasks')
    .update(updatePayload as any)
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken taak: ${error.message}`)

  await supabase.from('task_audit_log').insert({
    task_id:       id,
    user_id:       user.id,
    actie:         'bijgewerkt',
    oud_waarde:    oud as Json | null,
    nieuwe_waarde: data as unknown as Json,
  })

  // Ook langs deze weg kan de status wijzigen → Bouw7 meenemen (fail-soft, zie updateTaakStatus).
  if (data.status !== undefined && data.status !== oud?.status) {
    await spiegelTaakstatusNaarBouw7(id, data.status).catch(() => {})
  }

  revalidatePath('/taken')
  if (oud?.lijst_id) revalidatePath(`/taken/lijsten/${oud.lijst_id}`)
}

export async function verwijderTaak(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const { data: taak } = await supabase
    .from('tasks').select('lijst_id, titel').eq('id', id).single()

  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen taak: ${error.message}`)

  revalidatePath('/taken')
  if (taak?.lijst_id) revalidatePath(`/taken/lijsten/${taak.lijst_id}`)
}

export async function updateTaakVolgorde(
  taken: { id: string; volgorde: number }[]
): Promise<void> {
  const supabase = await createClient()

  const updates = taken.map(({ id, volgorde }) =>
    supabase.from('tasks').update({ volgorde }).eq('id', id)
  )
  await Promise.all(updates)

  revalidatePath('/taken')
}

// ─── Toewijzingen ─────────────────────────────────────────────────────────────

export async function voegAssigneeToe(
  taskId: string,
  userId: string,
  rol: TaskAssigneeRol = 'verantwoordelijke'
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('task_assignees')
    .upsert({ task_id: taskId, user_id: userId, rol })

  if (error) throw new Error(`Fout bij toewijzen: ${error.message}`)
  revalidatePath('/taken')
}

export async function verwijderAssignee(taskId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('task_assignees')
    .delete()
    .eq('task_id', taskId)
    .eq('user_id', userId)

  if (error) throw new Error(`Fout bij verwijderen toewijzing: ${error.message}`)
  revalidatePath('/taken')
}

export async function zetAssignees(
  taskId: string,
  assignees: { user_id: string; rol: TaskAssigneeRol }[]
): Promise<void> {
  const supabase = await createClient()
  const { error: delErr } = await supabase
    .from('task_assignees').delete().eq('task_id', taskId)
  if (delErr) throw new Error(`Fout bij verwijderen toewijzingen: ${delErr.message}`)

  if (assignees.length > 0) {
    const { error: insErr } = await supabase
      .from('task_assignees')
      .insert(assignees.map(a => ({ task_id: taskId, user_id: a.user_id, rol: a.rol })))
    if (insErr) throw new Error(`Fout bij vastleggen toewijzingen: ${insErr.message}`)
  }

  revalidatePath('/taken')
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function plaatsComment(taskId: string, inhoud: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, user_id: user.id, inhoud })

  if (error) throw new Error(`Fout bij plaatsen comment: ${error.message}`)
  revalidatePath('/taken')
}

export async function verwijderComment(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  const { error } = await supabase
    .from('task_comments')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw new Error(`Fout bij verwijderen comment: ${error.message}`)
  revalidatePath('/taken')
}
