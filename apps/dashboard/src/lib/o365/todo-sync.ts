/**
 * o365/todo-sync.ts
 *
 * Microsoft To Do → EVA-acties, per medewerker.
 *
 * Richting: wat iemand in To Do (of vanuit Outlook) aanmaakt, verschijnt als actie in
 * "Mijn acties". EVA-eigen acties gaan níet naar To Do. Voor een actie die uit To Do komt,
 * houden we status, titel en deadline aan beide kanten gelijk; de weg terug staat in
 * todo-write.ts.
 *
 * Mechaniek: per actieve lijst een Graph-delta. Elke ronde levert alleen wat er sinds de
 * vorige deltaLink veranderde, inclusief verwijderde taken (`@removed`). Polling en geen
 * Graph-subscriptions, om dezelfde reden als bij de mailintake (lib/o365/inbox.ts):
 * abonnementen verlopen na een paar dagen en een gemiste verlenging valt stil.
 *
 * Kaatsen voorkomen: als EVA zelf een taak in To Do wijzigt, slaat todo-write.ts de nieuwe
 * `lastModifiedDateTime` op in `task_todo_sync.todo_gewijzigd_op`. Komt diezelfde stand hier
 * in de delta langs, dan is dat onze eigen write en slaan we hem over.
 *
 * Conflict (allebei gewijzigd sinds de vorige ronde): de laatste wijziging wint, To Do
 * `lastModifiedDateTime` tegen `tasks.updated_at`.
 */

import { createAdminClient } from '@everts/database/server'

import {
  haalTodoLijsten, haalTodoDelta, TodoDeltaVerlopen,
  todoNaarEvaStatus, todoNaarEvaPrioriteit, todoDeadline, evaDeadlineDag, todoOmschrijving,
  type TodoTaak, type TodoDelta,
} from './todo'
import { heeftTodoScope } from './scopes'
import { synchroniseerBewakingUitActies } from '@/lib/commercie/nabel-sync'

export interface TodoSyncResultaat {
  medewerkerId: string
  lijsten: number
  nieuw: number
  bijgewerkt: number
  vervallen: number
  fout?: string
}

interface LijstRij {
  id: string
  todo_list_id: string
  naam: string
  actief: boolean
  delta_link: string | null
}

interface KoppelRij {
  task_id: string
  todo_task_id: string
  todo_gewijzigd_op: string | null
}

interface TaakStand {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  dossier_id: string | null
  updated_at: string | null
  todo_lijst_naam: string | null
}

/** Per keer zoveel ids in één `.in()`: ruim onder de URL-lengtegrens en de 1000-rijengrens. */
const IN_BATCH = 200

export async function syncTodoVoorMedewerker(medewerkerId: string): Promise<TodoSyncResultaat> {
  const res: TodoSyncResultaat = { medewerkerId, lijsten: 0, nieuw: 0, bijgewerkt: 0, vervallen: 0 }
  const admin = createAdminClient()

  const { data: mw } = await admin
    .from('medewerkers').select('auth_user_id').eq('id', medewerkerId).maybeSingle()
  const eigenaar = mw?.auth_user_id
  if (!eigenaar) {
    res.fout = 'Medewerker heeft geen EVA-account.'
    return res
  }

  await werkLijstenBij(medewerkerId, res)

  const { data: actief } = await admin
    .from('medewerker_todo_lijsten')
    .select('id, todo_list_id, naam, actief, delta_link')
    .eq('medewerker_id', medewerkerId)
    .eq('actief', true)

  for (const lijst of (actief ?? []) as LijstRij[]) {
    res.lijsten++
    await verwerkLijst(medewerkerId, eigenaar, lijst, res)
  }
  return res
}

/** Lijsten uit To Do overnemen: nieuwe erbij (actief), hernoemde bijwerken, verdwenen opruimen. */
async function werkLijstenBij(medewerkerId: string, res: TodoSyncResultaat): Promise<void> {
  const admin = createAdminClient()
  const remote = (await haalTodoLijsten(medewerkerId))
    .filter(l => l.wellknownListName !== 'flaggedEmails')

  const { data: bekend } = await admin
    .from('medewerker_todo_lijsten')
    .select('id, todo_list_id, naam, actief, delta_link')
    .eq('medewerker_id', medewerkerId)
  const bekendePerId = new Map(((bekend ?? []) as LijstRij[]).map(l => [l.todo_list_id, l]))

  for (const l of remote) {
    const b = bekendePerId.get(l.id)
    if (!b) {
      await admin.from('medewerker_todo_lijsten').insert({
        medewerker_id: medewerkerId, todo_list_id: l.id, naam: l.displayName, wellknown_name: l.wellknownListName,
      })
    } else if (b.naam !== l.displayName) {
      await admin.from('medewerker_todo_lijsten').update({ naam: l.displayName }).eq('id', b.id)
      // De groepskop in Mijn acties volgt de nieuwe naam.
      const ids = await gekoppeldeTaken(medewerkerId, l.id)
      for (let i = 0; i < ids.length; i += IN_BATCH) {
        await admin.from('tasks').update({ todo_lijst_naam: l.displayName }).in('id', ids.slice(i, i + IN_BATCH))
      }
    }
  }

  // Lijst in To Do verwijderd → de openstaande acties vervallen, de lijst vergeten.
  const remoteIds = new Set(remote.map(l => l.id))
  for (const b of bekendePerId.values()) {
    if (remoteIds.has(b.todo_list_id)) continue
    res.vervallen += await laatVervallen(await gekoppeldeTaken(medewerkerId, b.todo_list_id))
    await admin.from('medewerker_todo_lijsten').delete().eq('id', b.id)
  }
}

async function gekoppeldeTaken(medewerkerId: string, lijstId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('task_todo_sync')
    .select('task_id')
    .eq('medewerker_id', medewerkerId)
    .eq('todo_list_id', lijstId)
    .limit(1000)
  return ((data ?? []) as { task_id: string }[]).map(k => k.task_id)
}

async function verwerkLijst(medewerkerId: string, eigenaar: string, lijst: LijstRij, res: TodoSyncResultaat): Promise<void> {
  const admin = createAdminClient()

  let delta: TodoDelta
  try {
    delta = await haalTodoDelta(medewerkerId, lijst.todo_list_id, lijst.delta_link)
  } catch (e) {
    if (!(e instanceof TodoDeltaVerlopen)) throw e
    delta = await haalTodoDelta(medewerkerId, lijst.todo_list_id, null)
  }

  // Koppelingen en EVA-stand voor precies de taken in deze delta.
  const raakIds = [...delta.taken.map(t => t.id), ...delta.verwijderd]
  const koppelingen = new Map<string, KoppelRij>()
  for (let i = 0; i < raakIds.length; i += IN_BATCH) {
    const { data } = await admin
      .from('task_todo_sync')
      .select('task_id, todo_task_id, todo_gewijzigd_op')
      .eq('medewerker_id', medewerkerId)
      .in('todo_task_id', raakIds.slice(i, i + IN_BATCH))
    for (const k of (data ?? []) as KoppelRij[]) koppelingen.set(k.todo_task_id, k)
  }

  const taakIds = [...koppelingen.values()].map(k => k.task_id)
  const standen = new Map<string, TaakStand>()
  for (let i = 0; i < taakIds.length; i += IN_BATCH) {
    const { data } = await admin
      .from('tasks')
      .select('id, titel, status, prioriteit, deadline, dossier_id, updated_at, todo_lijst_naam')
      .in('id', taakIds.slice(i, i + IN_BATCH))
    for (const t of (data ?? []) as TaakStand[]) standen.set(t.id, t)
  }

  for (const t of delta.taken) {
    const k = koppelingen.get(t.id)
    if (!k) {
      // Afgevinkt én nog nooit in EVA geweest: niets te doen. Zo halen we bij de eerste
      // ronde niet de hele historie van afgeronde taken binnen.
      if (t.status === 'completed') continue
      if (await maakActie(medewerkerId, eigenaar, lijst, t)) res.nieuw++
      continue
    }
    // Onze eigen write (of een stand die we al verwerkten).
    if (k.todo_gewijzigd_op && Date.parse(k.todo_gewijzigd_op) >= Date.parse(t.lastModifiedDateTime)) continue
    const stand = standen.get(k.task_id)
    if (stand && await werkActieBij(medewerkerId, stand, lijst, t)) res.bijgewerkt++
  }

  const weg = delta.verwijderd.map(id => koppelingen.get(id)?.task_id).filter(Boolean) as string[]
  res.vervallen += await laatVervallen(weg)

  await admin
    .from('medewerker_todo_lijsten')
    .update({ delta_link: delta.deltaLink, laatst_gesynct: new Date().toISOString() })
    .eq('id', lijst.id)
}

async function maakActie(medewerkerId: string, eigenaar: string, lijst: LijstRij, t: TodoTaak): Promise<boolean> {
  const admin = createAdminClient()
  const deadline = todoDeadline(t.dueDateTime)
  const { data: taak, error } = await admin
    .from('tasks')
    .insert({
      titel: t.title?.trim() || '(zonder titel)',
      omschrijving: todoOmschrijving(t) as never,
      status: todoNaarEvaStatus(t.status),
      prioriteit: todoNaarEvaPrioriteit(t.importance),
      deadline,
      deadline_handmatig: deadline != null,
      assignee_type: 'direct',
      aangemaakt_door: eigenaar,
      todo_lijst_naam: lijst.naam,
    })
    .select('id')
    .single()
  if (error || !taak) throw new Error(`To Do-taak "${t.title}" niet overgenomen: ${error?.message}`)

  const { error: koppelFout } = await admin.from('task_todo_sync').insert({
    task_id: taak.id,
    medewerker_id: medewerkerId,
    todo_list_id: lijst.todo_list_id,
    todo_task_id: t.id,
    todo_gewijzigd_op: t.lastModifiedDateTime,
    todo_completed: t.status === 'completed',
    laatst_gesynct: new Date().toISOString(),
  })
  if (koppelFout) {
    // Een gelijktijdige ronde (cron en scherm tegelijk) was ons voor: de dubbele actie weer weg.
    await admin.from('tasks').delete().eq('id', taak.id)
    return false
  }
  // Geen "aan jou toegewezen"-melding: je hebt hem zelf aangemaakt.
  await admin.from('task_assignees').insert({ task_id: taak.id, user_id: eigenaar, rol: 'verantwoordelijke' })
  return true
}

async function werkActieBij(medewerkerId: string, stand: TaakStand, lijst: LijstRij, t: TodoTaak): Promise<boolean> {
  const admin = createAdminClient()

  // Allebei gewijzigd sinds de vorige ronde? Dan wint de laatste. Is EVA nieuwer, dan heeft
  // todo-write.ts die stand al naar To Do gestuurd (of gaat dat bij de volgende EVA-wijziging).
  const evaNieuwer = !!stand.updated_at && Date.parse(stand.updated_at) > Date.parse(t.lastModifiedDateTime)

  const patch: Record<string, unknown> = {}
  if (!evaNieuwer) {
    const titel = t.title?.trim() || '(zonder titel)'
    if (titel !== stand.titel) patch.titel = titel
    const status = todoNaarEvaStatus(t.status)
    // Een vervallen EVA-actie blijft vervallen; To Do kent die stand niet.
    if (status !== stand.status && stand.status !== 'vervallen') patch.status = status
    const deadline = todoDeadline(t.dueDateTime)
    if (deadline !== evaDeadlineDag(stand.deadline)) {
      patch.deadline = deadline
      patch.deadline_handmatig = deadline != null
    }
    // Alleen hoog ↔ normaal; een in EVA gekozen 'urgent' of 'laag' blijft staan.
    const prio = todoNaarEvaPrioriteit(t.importance)
    if (prio !== stand.prioriteit && (stand.prioriteit === 'hoog' || stand.prioriteit === 'normaal')) {
      patch.prioriteit = prio
    }
    patch.omschrijving = todoOmschrijving(t)
  }
  if (lijst.naam !== stand.todo_lijst_naam) patch.todo_lijst_naam = lijst.naam

  const gewijzigd = Object.keys(patch).some(k => k !== 'omschrijving')
  if (Object.keys(patch).length) {
    if (gewijzigd) patch.updated_at = new Date().toISOString()
    await admin.from('tasks').update(patch as never).eq('id', stand.id)
    if (patch.status === 'gereed' && stand.dossier_id) {
      await synchroniseerBewakingUitActies({ dossierIds: [stand.dossier_id] }).catch(() => {})
    }
  }

  await admin
    .from('task_todo_sync')
    .update({
      todo_gewijzigd_op: t.lastModifiedDateTime,
      todo_completed: t.status === 'completed',
      laatst_gesynct: new Date().toISOString(),
    })
    .eq('medewerker_id', medewerkerId)
    .eq('todo_task_id', t.id)

  return gewijzigd
}

/** Openstaande acties op vervallen; de koppeling gaat mee weg zodat er niets meer terugschrijft. */
async function laatVervallen(taakIds: string[]): Promise<number> {
  if (!taakIds.length) return 0
  const admin = createAdminClient()
  let aantal = 0
  for (let i = 0; i < taakIds.length; i += IN_BATCH) {
    const deel = taakIds.slice(i, i + IN_BATCH)
    const { data } = await admin
      .from('tasks')
      .update({ status: 'vervallen', updated_at: new Date().toISOString() })
      .in('id', deel)
      .not('status', 'in', '(gereed,vervallen)')
      .select('id')
    aantal += (data ?? []).length
    await admin.from('task_todo_sync').delete().in('task_id', deel)
  }
  return aantal
}

/**
 * Medewerkers bij wie de To Do-koppeling aanstaat: een niet-verlopen token mét de
 * Tasks-scope en `todo_sync_actief`. Eén rij per medewerker, dus ruim onder de 1000.
 */
export async function medewerkersMetTodo(): Promise<string[]> {
  const { data } = await createAdminClient()
    .from('medewerker_o365_tokens')
    .select('medewerker_id, scopes')
    .eq('todo_sync_actief', true)
    .is('verlopen_op', null)
    .limit(1000)
  return ((data ?? []) as { medewerker_id: string; scopes: string[] | null }[])
    .filter(r => heeftTodoScope(r.scopes))
    .map(r => r.medewerker_id)
}
