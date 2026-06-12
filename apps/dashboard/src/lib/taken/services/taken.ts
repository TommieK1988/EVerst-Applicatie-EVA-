/**
 * Taken & Actielijsten service — server-side data-ophaling via Supabase
 */
import { createClient } from '@/lib/taken/supabase/server'
import { createAdminClient } from '@everts/database/server'
import type {
  DbTask, DbTaskList, DbTaskComment, DbTaskAssignee,
  TaakMetDetails, ActielijstMetTaken, UrgenteTaak,
} from '@/lib/taken/supabase/database.types'

export type { UrgenteTaak }

// ─── Actielijsten ─────────────────────────────────────────────────────────────

export type ActielijstMetTriggerCount = DbTaskList & { triggers_count: number }

export async function getActielijsten(): Promise<ActielijstMetTriggerCount[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .eq('is_template', true)
    .order('template_naam', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Fout bij ophalen actielijsten: ${error.message}`)

  // Tel actieve triggers per sjabloon. Via admin client: actielijst_triggers heeft
  // RLS aan zonder policies en is dus alleen via service_role leesbaar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any
  const { data: trig } = await admin
    .from('actielijst_triggers')
    .select('template_id')
    .eq('actief', true)
  const counts = new Map<string, number>()
  for (const t of (trig ?? []) as { template_id: string }[]) {
    counts.set(t.template_id, (counts.get(t.template_id) ?? 0) + 1)
  }

  return (data ?? []).map(l => ({ ...l, triggers_count: counts.get(l.id) ?? 0 }))
}

export async function getActielijst(id: string): Promise<ActielijstMetTaken | null> {
  const supabase = await createClient()

  const { data: lijst, error: lijstError } = await supabase
    .from('task_lists')
    .select('*')
    .eq('id', id)
    .single()

  if (lijstError) {
    if (lijstError.code === 'PGRST116') return null
    throw new Error(`Fout bij ophalen actielijst: ${lijstError.message}`)
  }

  const taken = await getTakenVoorLijst(id)

  return {
    ...lijst,
    taken,
    taken_count: taken.length,
    gereed_count: taken.filter(t => t.status === 'gereed').length,
  }
}

export async function getActielijstenVoorEntiteit(
  entityType: string,
  entityId: string
): Promise<DbTaskList[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .eq('entity_type', entityType as 'project' | 'offerte' | 'calculatie')
    .eq('entity_id', entityId)
    .order('volgorde', { ascending: true })

  if (error) throw new Error(`Fout bij ophalen actielijsten voor entiteit: ${error.message}`)
  return data
}

export async function getTemplates(): Promise<DbTaskList[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .eq('is_template', true)
    .order('template_naam', { ascending: true })

  if (error) throw new Error(`Fout bij ophalen templates: ${error.message}`)
  return data
}

// ─── Taken ────────────────────────────────────────────────────────────────────

export async function getTaken(opties?: {
  lijstId?: string
  status?: string
  prioriteit?: string
  assigneeId?: string
  vanDeadline?: string
  totDeadline?: string
}): Promise<TaakMetDetails[]> {
  const supabase = await createClient()

  let query = supabase
    .from('tasks')
    .select(`
      *,
      task_assignees ( task_id, user_id, rol ),
      subtaken:tasks!parent_task_id ( id ),
      task_comments ( id ),
      task_attachments ( id ),
      lijst:task_lists ( id, naam )
    `)
    .is('parent_task_id', null)
    .order('volgorde', { ascending: true })
    .order('created_at', { ascending: false })

  if (opties?.lijstId)     query = query.eq('lijst_id', opties.lijstId)
  if (opties?.status)      query = query.eq('status', opties.status as 'open' | 'in_behandeling' | 'wacht_op' | 'gereed' | 'vervallen')
  if (opties?.prioriteit)  query = query.eq('prioriteit', opties.prioriteit as 'laag' | 'normaal' | 'hoog' | 'urgent')
  if (opties?.vanDeadline) query = query.gte('deadline', opties.vanDeadline)
  if (opties?.totDeadline) query = query.lte('deadline', opties.totDeadline)

  const { data, error } = await query

  if (error) throw new Error(`Fout bij ophalen taken: ${error.message}`)

  return (data as any[]).map(taak => ({
    ...taak,
    assignees: taak.task_assignees ?? [],
    subtaken: taak.subtaken ?? [],
    comments_count: (taak.task_comments ?? []).length,
    attachments_count: (taak.task_attachments ?? []).length,
    lijst: taak.lijst ?? undefined,
  }))
}

function hoofdstatusToSectie(h?: string): string | null {
  if (h === 'aanvraag') return 'aanvragen'
  if (h === 'offerte')  return 'offertes'
  if (h === 'opdracht') return 'opdrachten'
  return null
}

export async function getMijnTaken(userId: string): Promise<TaakMetDetails[]> {
  const supabase = await createClient()

  const { data: toewijzingen, error: tError } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId)

  if (tError) throw new Error(`Fout bij ophalen toewijzingen: ${tError.message}`)

  const taskIds = toewijzingen.map(t => t.task_id)
  if (taskIds.length === 0) return []

  // as any: dossiers join staat niet in gegenereerde types
  const { data, error } = await (supabase as any)
    .from('tasks')
    .select(`
      *,
      task_assignees ( task_id, user_id, rol ),
      subtaken:tasks!parent_task_id ( id ),
      task_comments ( id ),
      task_attachments ( id ),
      lijst:task_lists ( id, naam, dossier_id, dossiers ( id, titel, hoofdstatus ) )
    `)
    .in('id', taskIds)
    .is('parent_task_id', null)
    .neq('status', 'gereed')
    .neq('status', 'vervallen')
    .order('deadline', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`Fout bij ophalen mijn taken: ${error.message}`)

  return (data as any[]).map(taak => ({
    ...taak,
    assignees:         taak.task_assignees ?? [],
    subtaken:          taak.subtaken ?? [],
    comments_count:    (taak.task_comments ?? []).length,
    attachments_count: (taak.task_attachments ?? []).length,
    lijst:             taak.lijst ?? undefined,
    dossier_id:        taak.lijst?.dossier_id ?? null,
    dossier_naam:      taak.lijst?.dossiers?.titel ?? null,
    dossier_sectie:    hoofdstatusToSectie(taak.lijst?.dossiers?.hoofdstatus),
  }))
}

export async function getTakenVoorLijst(lijstId: string): Promise<TaakMetDetails[]> {
  return getTaken({ lijstId })
}

export async function getTaak(id: string): Promise<TaakMetDetails | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      task_assignees ( task_id, user_id, rol ),
      subtaken:tasks!parent_task_id ( * ),
      task_comments ( * ),
      task_attachments ( * ),
      lijst:task_lists ( id, naam )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`Fout bij ophalen taak: ${error.message}`)
  }

  return {
    ...(data as any),
    assignees: (data as any).task_assignees ?? [],
    subtaken: (data as any).subtaken ?? [],
    comments_count: ((data as any).task_comments ?? []).length,
    attachments_count: ((data as any).task_attachments ?? []).length,
    lijst: (data as any).lijst ?? undefined,
  }
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<DbTaskComment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Fout bij ophalen comments: ${error.message}`)
  return data
}

// ─── Admin queries (geen RLS) ────────────────────────────────────────────────
// Alleen aanroepen vanuit Server Components, nooit vanuit client code.

export async function getActielijstenVoorDossier(dossier_id: string): Promise<ActielijstMetTaken[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: lijsten } = await supabase
    .from('task_lists')
    .select('*')
    .eq('dossier_id', dossier_id)
    .eq('is_template', false)
    .order('created_at', { ascending: false })

  if (!lijsten?.length) return []

  // Haal op welke lijsten automatisch (via trigger) zijn geactiveerd, voor de badge.
  const { data: activeringen } = await supabase
    .from('actielijst_activeringen')
    .select('lijst_id, bron, verwerkt_op')
    .eq('dossier_id', dossier_id)
    .eq('status', 'done')
  const activeringPerLijst = new Map<string, { bron: string; verwerkt_op: string | null }>(
    (activeringen ?? [])
      .filter((a: { lijst_id: string | null }) => a.lijst_id)
      .map((a: { lijst_id: string; bron: string; verwerkt_op: string | null }) =>
        [a.lijst_id, { bron: a.bron, verwerkt_op: a.verwerkt_op }]),
  )

  const result: ActielijstMetTaken[] = []
  for (const lijst of lijsten) {
    const activering = activeringPerLijst.get(lijst.id)
    const { data: taken } = await supabase
      .from('tasks')
      .select('*, task_assignees(*)')
      .eq('lijst_id', lijst.id)
      .order('volgorde')

    const takenArr = taken ?? []
    result.push({
      ...lijst,
      taken: takenArr.map((t: Record<string, unknown>) => ({
        ...t,
        assignees:         t.task_assignees ?? [],
        subtaken:          [],
        comments_count:    0,
        attachments_count: 0,
      })) as unknown as ActielijstMetTaken['taken'],
      taken_count:  takenArr.length,
      gereed_count: takenArr.filter((t: { status: string }) => t.status === 'gereed').length,
      auto_geactiveerd_op: activering?.bron === 'trigger' ? activering.verwerkt_op : null,
    })
  }
  return result
}

export async function getSjablonen(): Promise<DbTaskList[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('task_lists')
    .select('*')
    .eq('is_template', true)
    .order('template_naam', { ascending: true })
  return (data ?? []) as DbTaskList[]
}

function _sectionForStatus(h?: string | null): string {
  if (h === 'aanvraag') return 'aanvragen'
  if (h === 'offerte')  return 'offertes'
  if (h === 'opdracht') return 'opdrachten'
  return 'aanvragen'
}

export async function getUrgenteTakenVoorDossier(dossier_id: string): Promise<UrgenteTaak[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: lijsten } = await supabase
    .from('task_lists')
    .select('id')
    .eq('dossier_id', dossier_id)
    .eq('is_template', false)

  const lijstIds = (lijsten ?? []).map((l: { id: string }) => l.id)
  if (lijstIds.length === 0) return []

  const { data: taken } = await supabase
    .from('tasks')
    .select('id, titel, deadline, prioriteit, status, task_assignees(user_id)')
    .in('lijst_id', lijstIds)
    .not('status', 'in', '("gereed","vervallen")')
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(10)

  if (!taken?.length) return []

  const userIds = [...new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    taken.flatMap((t: any) => (t.task_assignees ?? []).map((a: any) => a.user_id))
  )]

  let namenMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: meds } = await supabase
      .from('medewerkers')
      .select('auth_user_id, voornaam, tussenvoegsel, achternaam')
      .in('auth_user_id', userIds)

    namenMap = Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (meds ?? []).map((m: any) => [
        m.auth_user_id,
        [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
      ])
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return taken.map((t: any) => ({
    id:            t.id,
    titel:         t.titel,
    deadline:      t.deadline,
    prioriteit:    t.prioriteit,
    status:        t.status,
    assignee_naam: namenMap[(t.task_assignees?.[0]?.user_id)] ?? null,
  }))
}

export async function getDossierRedirectUrlVoorLijst(lijstId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: lijst } = await supabase
    .from('task_lists')
    .select('is_template, dossier_id')
    .eq('id', lijstId)
    .single()

  if (!lijst || lijst.is_template || !lijst.dossier_id) return null

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('id, hoofdstatus')
    .eq('id', lijst.dossier_id)
    .single()

  if (!dossier) return null
  return `/${_sectionForStatus(dossier.hoofdstatus)}/${dossier.id}/taken`
}
