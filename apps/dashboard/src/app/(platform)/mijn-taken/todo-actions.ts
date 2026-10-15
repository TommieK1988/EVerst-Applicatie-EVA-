'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'

import { vereisSessie } from '@/lib/auth/rechten'
import { controleerKoppeling, type KoppelingStatus } from '@/lib/o365/tokens'
import { todoActief } from '@/lib/o365/scopes'
import { syncTodoVoorMedewerker } from '@/lib/o365/todo-sync'

/**
 * Microsoft To Do op Mijn acties: koppelstatus, lijsten aan/uit en "Nu synchroniseren".
 * Alles voor de ingelogde medewerker zelf; een ander zijn To Do bekijk je hier niet.
 */

export interface TodoLijstWeergave {
  id: string
  naam: string
  actief: boolean
  gedeeld: boolean | null
  laatst_gesynct: string | null
}

export interface TodoStatus {
  /** Staat de koppeling in EVA aan (O365_TODO_ACTIEF)? Zo niet, dan toont het scherm niets. */
  beschikbaar: boolean
  medewerkerId: string
  koppeling: KoppelingStatus
  lijsten: TodoLijstWeergave[]
}

export async function haalTodoStatus(): Promise<TodoStatus> {
  const mw = await vereisSessie()
  if (!todoActief()) return { beschikbaar: false, medewerkerId: mw.id, koppeling: 'geen', lijsten: [] }

  const koppeling = await controleerKoppeling(mw.id)
  const { data } = await createAdminClient()
    .from('medewerker_todo_lijsten')
    .select('id, naam, actief, gedeeld, laatst_gesynct')
    .eq('medewerker_id', mw.id)
    .order('naam')
    .limit(200)
  return { beschikbaar: true, medewerkerId: mw.id, koppeling, lijsten: (data ?? []) as TodoLijstWeergave[] }
}

/** Bovengrens voor een sync vanaf het scherm; de cron vangt op wat hier niet afkomt. */
const SCHERM_SYNC_MS = 8_000

export async function synchroniseerMijnToDo(): Promise<
  { ok: true; nieuw: number; bijgewerkt: number; vervallen: number } | { ok: false; fout: string }
> {
  const mw = await vereisSessie()
  if (!todoActief()) return { ok: false, fout: 'De koppeling met Microsoft To Do staat (nog) niet aan.' }

  try {
    const res = await Promise.race([
      syncTodoVoorMedewerker(mw.id),
      new Promise<never>((_, weiger) => setTimeout(() => weiger(new Error('Microsoft To Do reageert traag; de achtergrondronde haalt het op.')), SCHERM_SYNC_MS)),
    ])
    if (res.fout) return { ok: false, fout: res.fout }
    if (res.nieuw || res.bijgewerkt || res.vervallen) revalidatePath('/mijn-taken')
    return { ok: true, nieuw: res.nieuw, bijgewerkt: res.bijgewerkt, vervallen: res.vervallen }
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : 'Synchroniseren met Microsoft To Do mislukt.' }
  }
}

/**
 * Een lijst aan- of uitzetten. Uitzetten laat de acties die er al staan met rust en haalt
 * geen nieuwe meer op; weer aanzetten begint met een volledige ronde (deltaLink leeg).
 */
export async function zetTodoLijstActief(lijstId: string, actief: boolean): Promise<void> {
  const mw = await vereisSessie()
  const { error } = await createAdminClient()
    .from('medewerker_todo_lijsten')
    .update({ actief, ...(actief ? { delta_link: null } : {}) })
    .eq('id', lijstId)
    .eq('medewerker_id', mw.id)
  if (error) throw new Error(`Lijst niet bijgewerkt: ${error.message}`)
  revalidatePath('/mijn-taken')
}
