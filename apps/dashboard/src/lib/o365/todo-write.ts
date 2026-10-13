/**
 * o365/todo-write.ts
 *
 * EVA → Microsoft To Do, alleen voor acties die uit To Do komen (er is een
 * `task_todo_sync`-rij). EVA-eigen acties gaan nooit naar To Do.
 *
 * Schrijft met het token van de eigenaar van de To Do-taak (de medewerker uit de
 * koppeling), niet met dat van wie er in EVA op klikt: een collega die jouw actie
 * afvinkt, kan niet in jouw To Do.
 *
 * Faalt nooit hard: de EVA-wijziging blijft staan, de fout gaat naar de console.
 * Na een mislukte write staat To Do achter; de volgende wijziging in EVA probeert het
 * opnieuw, en een wijziging in To Do zelf komt via de sync weer binnen.
 */

import { createAdminClient } from '@everts/database/server'

import { patchTodoTaak, verwijderTodoTaak, evaNaarTodoStatus, evaDeadlineDag, type TodoPatch } from './todo'

interface Koppeling {
  medewerker_id: string
  todo_list_id: string
  todo_task_id: string
}

export interface TodoWijziging {
  status?: string
  titel?: string
  /** Zoals EVA hem opslaat (ISO of 'YYYY-MM-DD'), of null voor geen deadline. */
  deadline?: string | null
}

/** De To Do-koppeling van een actie, of null bij een EVA-eigen actie. */
export async function todoKoppeling(taskId: string): Promise<Koppeling | null> {
  const { data } = await createAdminClient()
    .from('task_todo_sync')
    .select('medewerker_id, todo_list_id, todo_task_id')
    .eq('task_id', taskId)
    .maybeSingle()
  return (data as Koppeling | null) ?? null
}

export async function spiegelNaarTodo(taskId: string, wijziging: TodoWijziging): Promise<void> {
  try {
    const k = await todoKoppeling(taskId)
    if (!k) return

    const patch: TodoPatch = {}
    if (wijziging.status !== undefined) patch.status = evaNaarTodoStatus(wijziging.status)
    if (wijziging.titel !== undefined && wijziging.titel.trim()) patch.title = wijziging.titel.trim()
    if (wijziging.deadline !== undefined) patch.deadline = evaDeadlineDag(wijziging.deadline)
    if (!Object.keys(patch).length) return

    const gewijzigdOp = await patchTodoTaak(k.medewerker_id, k.todo_list_id, k.todo_task_id, patch)
    // Deze stand komt straks in de delta terug; zo herkent de sync hem als de onze.
    await createAdminClient()
      .from('task_todo_sync')
      .update({
        todo_gewijzigd_op: gewijzigdOp,
        ...(patch.status ? { todo_completed: patch.status === 'completed', eva_status: wijziging.status } : {}),
        laatst_gesynct: new Date().toISOString(),
      })
      .eq('task_id', taskId)
  } catch (e) {
    console.error(`[todo-write] actie ${taskId} niet naar To Do geschreven:`, e)
  }
}

/**
 * Verwijdert de To Do-taak die bij een actie hoort. Roep aan vóórdat de actie zelf weg is:
 * de koppeling verdwijnt met de actie mee (on delete cascade).
 */
export async function verwijderUitTodo(koppeling: Koppeling | null): Promise<void> {
  if (!koppeling) return
  try {
    await verwijderTodoTaak(koppeling.medewerker_id, koppeling.todo_list_id, koppeling.todo_task_id)
  } catch (e) {
    console.error(`[todo-write] To Do-taak ${koppeling.todo_task_id} niet verwijderd:`, e)
  }
}
