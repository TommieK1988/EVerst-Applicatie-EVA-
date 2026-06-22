/**
 * Taken & Actielijsten service — server-side data-ophaling via Supabase
 */
import { createClient } from '@/lib/taken/supabase/server'
import { createAdminClient } from '@everts/database/server'
import type {
  DbTask, DbTaskList, DbTaskComment, DbTaskAssignee,
  TaakMetDetails, ActielijstMetTaken, UrgenteTaak,
} from '@/lib/taken/supabase/database.types'
import {
  getActieveDossierContext, getDossierContextVoorIds, type DossierContext,
} from '@/lib/dossiers/actief'

export type { UrgenteTaak }

/** Platte rij voor het Taken-overzicht: taak + dossier-context. */
export type TaakRij = {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  lijst_naam: string | null
  toegewezen_namen: string[]
  toegewezen_ids: string[]
  // Dossier-context (afgevlakt voor kolommen/slicers)
  dossier_id: string
  dossiernummer: string | null
  dossier_titel: string
  dossier_sectie: DossierContext['sectie']
  dossier_fase: string
  dossier_substatus: string | null
  klant_naam: string | null
  projectleider_naam: string | null
  uitvoerder_naam: string | null
  calculator_naam: string | null
  werkvoorbereider_naam: string | null
  werkadres_stad: string | null
  verwacht_startdatum: string | null
  verwacht_einddatum: string | null
}

// ─── Actielijsten ─────────────────────────────────────────────────────────────

export type ActielijstMetTriggerCount = DbTaskList & { triggers_count: number }

export async function getActielijsten(): Promise<ActielijstMetTriggerCount[]> {
  const supabase = await createClient()
  // Alles behalve dossier-instanties (gekloonde sjablonen); die staan op de
  // Actielijsten-tab van het dossier zelf. Toont dus sjablonen én losse lijsten.
  const { data, error } = await supabase
    .from('task_lists')
    .select('*')
    .is('dossier_id', null)
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
      subtaken:tasks!parent_task_id ( id, titel, status ),
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

  // Slanke query voor de "mijn taken"-lijst (mobiel + desktop-home-widgets):
  // alleen de taakkolommen + de dossier-koppeling. De relaties assignees/subtaken/
  // comments/attachments worden hier niet getoond, dus die joins laten we weg
  // (scheelt fors aan querytijd en payload). Velden hieronder op defaults gezet
  // zodat het TaakMetDetails-type intact blijft.
  // as any: dossiers join staat niet in gegenereerde types
  const { data, error } = await (supabase as any)
    .from('tasks')
    .select(`
      *,
      lijst:task_lists ( id, naam, dossier_id, dossiers ( id, titel, hoofdstatus ) ),
      dossier:dossiers ( id, titel, hoofdstatus )
    `)
    .in('id', taskIds)
    .is('parent_task_id', null)
    .neq('status', 'gereed')
    .neq('status', 'vervallen')
    .order('deadline', { ascending: false, nullsFirst: false })

  if (error) throw new Error(`Fout bij ophalen mijn taken: ${error.message}`)

  // Dossier-context: directe koppeling (losse taak) gaat vóór de koppeling via de lijst.
  return (data as any[]).map(taak => ({
    ...taak,
    assignees:         [],
    subtaken:          [],
    comments_count:    0,
    attachments_count: 0,
    lijst:             taak.lijst ?? undefined,
    dossier_id:        taak.dossier?.id ?? taak.lijst?.dossier_id ?? null,
    dossier_naam:      taak.dossier?.titel ?? taak.lijst?.dossiers?.titel ?? null,
    dossier_sectie:    hoofdstatusToSectie(taak.dossier?.hoofdstatus ?? taak.lijst?.dossiers?.hoofdstatus),
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

/** Losse taken die direct (zonder actielijst) aan een dossier hangen. */
export async function getLosseTakenVoorDossier(dossier_id: string): Promise<TaakMetDetails[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: taken } = await supabase
    .from('tasks')
    .select('*, task_assignees(*)')
    .eq('dossier_id', dossier_id)
    .is('lijst_id', null)
    .is('parent_task_id', null)
    .order('volgorde')
    .order('created_at', { ascending: false })

  return ((taken ?? []) as Record<string, unknown>[]).map(t => ({
    ...t,
    assignees:         t.task_assignees ?? [],
    subtaken:          [],
    comments_count:    0,
    attachments_count: 0,
  })) as unknown as TaakMetDetails[]
}

/**
 * Alle taken (los én binnen actielijsten) van actieve dossiers, plat met dossier-context.
 * Voor het Taken-overzicht. Alleen vanuit Server Components aanroepen (admin client).
 */
export async function getTakenVoorActieveDossiers(): Promise<TaakRij[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { ids, context } = await getActieveDossierContext()
  if (ids.length === 0) return []

  // Actielijst-instanties van actieve dossiers → map lijst_id → {dossier_id, naam}
  const { data: lijsten } = await supabase
    .from('task_lists')
    .select('id, naam, dossier_id')
    .in('dossier_id', ids)
  const lijstMap = new Map<string, { dossier_id: string; naam: string }>(
    (lijsten ?? []).map((l: { id: string; naam: string; dossier_id: string }) =>
      [l.id, { dossier_id: l.dossier_id, naam: l.naam }]),
  )
  const lijstIds = [...lijstMap.keys()]

  // Taken: direct aan dossier (losse taken) + taken binnen die actielijsten.
  const TAAK_SELECT = '*, task_assignees ( user_id )'
  const queries: Promise<{ data: Record<string, unknown>[] | null }>[] = [
    supabase.from('tasks').select(TAAK_SELECT)
      .in('dossier_id', ids).is('parent_task_id', null),
  ]
  if (lijstIds.length > 0) {
    queries.push(
      supabase.from('tasks').select(TAAK_SELECT)
        .in('lijst_id', lijstIds).is('parent_task_id', null),
    )
  }
  const resultaten = await Promise.all(queries)

  // Dedupe op task-id (een taak kan in beide queries vallen mag niet, maar wees veilig).
  const taakMap = new Map<string, Record<string, unknown>>()
  for (const res of resultaten) {
    for (const t of (res.data ?? [])) taakMap.set(t.id as string, t)
  }
  const taken = [...taakMap.values()]
  if (taken.length === 0) return []

  // Namen van toegewezen medewerkers ophalen.
  const userIds = [...new Set(
    taken.flatMap(t => ((t.task_assignees as { user_id: string }[]) ?? []).map(a => a.user_id)),
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
      ]),
    )
  }

  const rijen: TaakRij[] = []
  for (const t of taken) {
    const lijstId = (t.lijst_id as string | null) ?? null
    const lijst = lijstId ? lijstMap.get(lijstId) : undefined
    // Effectief dossier: directe koppeling vóór de koppeling via de lijst.
    const dossierId = (t.dossier_id as string | null) ?? lijst?.dossier_id ?? null
    if (!dossierId) continue
    const ctx = context.get(dossierId)
    if (!ctx) continue

    const assignees = ((t.task_assignees as { user_id: string }[]) ?? [])
    const toegewezen_ids = assignees.map(a => a.user_id)

    rijen.push({
      id: t.id as string,
      titel: t.titel as string,
      status: t.status as string,
      prioriteit: t.prioriteit as string,
      deadline: (t.deadline as string | null) ?? null,
      lijst_naam: lijst?.naam ?? null,
      toegewezen_ids,
      toegewezen_namen: toegewezen_ids.map(id => namenMap[id]).filter(Boolean),
      dossier_id: dossierId,
      dossiernummer: ctx.dossiernummer,
      dossier_titel: ctx.titel,
      dossier_sectie: ctx.sectie,
      dossier_fase: ctx.fase_label,
      dossier_substatus: ctx.substatus_label,
      klant_naam: ctx.klant_naam,
      projectleider_naam: ctx.projectleider_naam,
      uitvoerder_naam: ctx.uitvoerder_naam,
      calculator_naam: ctx.calculator_naam,
      werkvoorbereider_naam: ctx.werkvoorbereider_naam,
      werkadres_stad: ctx.werkadres_stad,
      verwacht_startdatum: ctx.verwacht_startdatum,
      verwacht_einddatum: ctx.verwacht_einddatum,
    })
  }

  return rijen
}

/**
 * Mijn toegewezen taken als platte rijen mét dossier-context, voor de "Mijn taken"-pagina.
 * Vertrekt — net als de home-widget (`getMijnTaken`) — vanuit `task_assignees`, zodat het
 * overzicht exact dezelfde taken toont als de widget: alle open taken die aan `userId` zijn
 * toegewezen, ongeacht of het dossier nog actief is.
 * Alleen vanuit Server Components aanroepen (admin client, geen RLS).
 */
export async function getMijnTakenRijen(userId: string): Promise<TaakRij[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: toewijzingen } = await supabase
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', userId)
  const taskIds = [...new Set(((toewijzingen ?? []) as { task_id: string }[]).map(t => t.task_id))]
  if (taskIds.length === 0) return []

  const { data: takenData } = await supabase
    .from('tasks')
    .select('*, task_assignees ( user_id )')
    .in('id', taskIds)
    .is('parent_task_id', null)
    .not('status', 'in', '("gereed","vervallen")')
    .order('deadline', { ascending: false, nullsFirst: false })
  const taken = (takenData ?? []) as Record<string, unknown>[]
  if (taken.length === 0) return []

  // Effectief dossier: directe koppeling vóór de koppeling via de actielijst.
  const lijstIds = [...new Set(taken.map(t => t.lijst_id as string | null).filter(Boolean) as string[])]
  const lijstMap = new Map<string, { dossier_id: string | null; naam: string }>()
  if (lijstIds.length > 0) {
    const { data: lijsten } = await supabase
      .from('task_lists')
      .select('id, naam, dossier_id')
      .in('id', lijstIds)
    for (const l of (lijsten ?? []) as { id: string; naam: string; dossier_id: string | null }[]) {
      lijstMap.set(l.id, { dossier_id: l.dossier_id, naam: l.naam })
    }
  }

  const effDossier = (t: Record<string, unknown>): string | null =>
    (t.dossier_id as string | null) ?? (t.lijst_id ? lijstMap.get(t.lijst_id as string)?.dossier_id ?? null : null)

  const dossierIds = [...new Set(taken.map(effDossier).filter(Boolean) as string[])]
  const context = await getDossierContextVoorIds(dossierIds)

  // Namen van toegewezen medewerkers.
  const userIds = [...new Set(
    taken.flatMap(t => ((t.task_assignees as { user_id: string }[]) ?? []).map(a => a.user_id)),
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
      ]),
    )
  }

  const rijen: TaakRij[] = []
  for (const t of taken) {
    const lijst = t.lijst_id ? lijstMap.get(t.lijst_id as string) : undefined
    const dossierId = effDossier(t)
    const ctx = dossierId ? context.get(dossierId) : undefined
    const toegewezen_ids = ((t.task_assignees as { user_id: string }[]) ?? []).map(a => a.user_id)

    rijen.push({
      id: t.id as string,
      titel: t.titel as string,
      status: t.status as string,
      prioriteit: t.prioriteit as string,
      deadline: (t.deadline as string | null) ?? null,
      lijst_naam: lijst?.naam ?? null,
      toegewezen_ids,
      toegewezen_namen: toegewezen_ids.map(id => namenMap[id]).filter(Boolean),
      dossier_id: dossierId ?? '',
      dossiernummer: ctx?.dossiernummer ?? null,
      dossier_titel: ctx?.titel ?? '—',
      dossier_sectie: ctx?.sectie ?? 'opdrachten',
      dossier_fase: ctx?.fase_label ?? '—',
      dossier_substatus: ctx?.substatus_label ?? null,
      klant_naam: ctx?.klant_naam ?? null,
      projectleider_naam: ctx?.projectleider_naam ?? null,
      uitvoerder_naam: ctx?.uitvoerder_naam ?? null,
      calculator_naam: ctx?.calculator_naam ?? null,
      werkvoorbereider_naam: ctx?.werkvoorbereider_naam ?? null,
      werkadres_stad: ctx?.werkadres_stad ?? null,
      verwacht_startdatum: ctx?.verwacht_startdatum ?? null,
      verwacht_einddatum: ctx?.verwacht_einddatum ?? null,
    })
  }

  return rijen
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

  // Taken via een actielijst van dit dossier ÓF rechtstreeks aan het dossier gekoppeld (losse taken).
  const orFilters = [`dossier_id.eq.${dossier_id}`]
  if (lijstIds.length > 0) orFilters.push(`lijst_id.in.(${lijstIds.join(',')})`)

  const { data: taken } = await supabase
    .from('tasks')
    .select('id, titel, deadline, prioriteit, status, volgorde, task_assignees(user_id)')
    .or(orFilters.join(','))
    .not('status', 'in', '("gereed","vervallen")')
    // Eerst op aflopende deadline, daarna op de volgorde van het actielijst-sjabloon.
    .order('deadline', { ascending: false, nullsFirst: false })
    .order('volgorde', { ascending: true })
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
