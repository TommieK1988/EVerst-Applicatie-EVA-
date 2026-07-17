/**
 * Two-way afvinken: schrijft het afvinken/heropenen van een taak in EVA terug naar de
 * gekoppelde Bouw7 to-do.
 *
 * Mechaniek (zie lib/bouw7/WRITE-ENDPOINTS.md §5a):
 *  - read-modify-write: GET /project/timeline/todo/{id} → alléén `isDone` vervangen →
 *    POST /project/timeline/todo met het volledige object.
 *  - De prefix `/project/timeline/…` is essentieel: `/todo` en `/todo/{id}` bestaan niet.
 *
 * Waarom het hele object terug moet: de POST is een upsert op `id` en de Bouw7-UI stuurt zelf
 * ook alle velden mee. Of een minimale body (`{ id, isDone }`) de rest laat staan of leegmaakt
 * is niet bewezen — en een fout gokje wist stilletjes omschrijvingen en toewijzingen van élke
 * afgevinkte to-do. Daarom spiegelen we exact wat de UI doet.
 *
 * Faalt nooit hard: bij een fout → `{ ok:false, error }` zodat het afvinken in EVA blijft staan.
 * Dat is veilig dankzij `tasks.bouw7_todo_done` (zie `syncBouw7Todos`): zolang die vlag niet op
 * `true` staat, ziet de lees-sync de nog-open Bouw7-to-do níét als heropening en laat hij de
 * afgevinkte EVA-taak met rust. Een mislukte write kost dus hooguit de spiegeling in Bouw7.
 */

import { getBouw7Client } from '@/lib/bouw7/sync'
import { createAdminClient } from '@everts/database/server'
import type { Bouw7TodoDetail } from '@/lib/bouw7/client'
import type { Bouw7WriteResult } from '@/lib/dossiers/bouw7-status'

/**
 * Zet `isDone` op een Bouw7 to-do en houdt `tasks.bouw7_todo_done` gelijk.
 *
 * Die vlag bijwerken is geen administratie maar functioneel: hij bewaart de laatst bekende
 * Bouw7-stand. Zou hij op `false` blijven staan terwijl de to-do in Bouw7 nu op `true` staat,
 * dan mist de sync een latere heropening in Bouw7 (die leest dan false→false = geen overgang)
 * en blijft de EVA-taak ten onrechte dicht.
 *
 * @param taakId  EVA-taak (`tasks.id`) — bepaalt de to-do én krijgt de vlag.
 * @param isDone  Nieuwe Bouw7-stand: `true` = afgevinkt.
 */
export async function schrijfBouw7TodoIsDone(taakId: string, isDone: boolean): Promise<Bouw7WriteResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { data: taak } = await admin
      .from('tasks')
      .select('bouw7_todo_id')
      .eq('id', taakId)
      .maybeSingle()

    const todoId = taak?.bouw7_todo_id
    // EVA-eigen taak (verreweg de meeste): niets te spiegelen.
    if (todoId == null) return { ok: true }

    const client = await getBouw7Client()

    // Read-modify-write: server-side velden eruit, alleen isDone vervangen.
    const huidig = await client.get<Bouw7TodoDetail>(`/project/timeline/todo/${todoId}`)
    if (huidig?.id == null) return { ok: false, error: `Bouw7 to-do ${todoId} niet gevonden.` }
    if (huidig.isDone === isDone) {
      await admin.from('tasks').update({ bouw7_todo_done: isDone }).eq('id', taakId)
      return { ok: true }
    }

    const { createdAt: _a, createdBy: _b, updatedAt: _c, updatedBy: _d, ...schrijfbaar } = huidig
    await client.post('/project/timeline/todo', {
      ...schrijfbaar,
      isDone,
      // Niet de hele Bouw7-ploeg mailen om een vinkje uit EVA.
      sendNotifications: false,
    })

    await admin.from('tasks').update({ bouw7_todo_done: isDone }).eq('id', taakId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven van de to-do naar Bouw7.' }
  }
}

/**
 * Spiegel een EVA-taakstatus naar Bouw7. Alleen de as open ↔ afgevinkt bestaat daar.
 *
 * `vervallen` schrijven we bewust NIET terug: Bouw7 kent geen "vervallen", en een geannuleerde
 * taak als "afgevinkt" doorgeven zou liegen tegen de collega's die in Bouw7 kijken. Zo'n taak
 * blijft daar dus open staan; in EVA blijft hij vervallen (de sync heropent hem niet meer).
 */
export async function spiegelTaakstatusNaarBouw7(taakId: string, status: string): Promise<Bouw7WriteResult> {
  if (status === 'vervallen') return { ok: true }
  return schrijfBouw7TodoIsDone(taakId, status === 'gereed')
}
