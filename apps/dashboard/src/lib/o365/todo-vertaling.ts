/**
 * o365/todo-vertaling.ts — Microsoft To Do ↔ EVA-acties, zonder netwerk of database.
 * Getest in todo-vertaling.test.ts.
 */

import type { TaskStatus, TaskPrioriteit } from '@/lib/taken/supabase/database.types'
import type { TodoTaak } from './todo'

/**
 * To Do-status → EVA-status. "Wacht op anderen" en "uitgesteld" bestaan in de
 * Graph-API maar niet in de To Do-app zelf; die vallen terug op de dichtstbijzijnde.
 */
export function todoNaarEvaStatus(status: TodoTaak['status']): TaskStatus {
  switch (status) {
    case 'completed':       return 'gereed'
    case 'inProgress':      return 'in_behandeling'
    case 'waitingOnOthers': return 'wacht_op'
    default:                return 'open'
  }
}

/**
 * EVA-status → To Do-status. `vervallen` wordt afgevinkt: de actie is van tafel, en in
 * je eigen To Do hoort hij dan niet als openstaand te blijven staan.
 */
export function evaNaarTodoStatus(status: string): TodoTaak['status'] {
  switch (status) {
    case 'gereed':
    case 'vervallen':      return 'completed'
    case 'in_behandeling': return 'inProgress'
    case 'wacht_op':       return 'waitingOnOthers'
    default:               return 'notStarted'
  }
}

/** Belangrijk in To Do = hoog in EVA. Andersom raken we de prioriteit niet aan. */
export function todoNaarEvaPrioriteit(importance: TodoTaak['importance']): TaskPrioriteit {
  return importance === 'high' ? 'hoog' : 'normaal'
}

/**
 * De kalenderdag van een To Do-deadline als 'YYYY-MM-DD'. Graph levert hem (dankzij de
 * Prefer-header) als lokale tijd zonder offset, bijv. '2026-10-14T00:00:00.0000000'.
 */
export function todoDeadline(due: TodoTaak['dueDateTime']): string | null {
  const dt = due?.dateTime
  return dt && /^\d{4}-\d{2}-\d{2}/.test(dt) ? dt.slice(0, 10) : null
}

/** De kalenderdag van een EVA-deadline (timestamptz, opgeslagen als middernacht UTC). */
export function evaDeadlineDag(deadline: string | null | undefined): string | null {
  return deadline ? deadline.slice(0, 10) : null
}

/**
 * Notitie (platte tekst) en gekoppelde items (bijv. de gemarkeerde mail) als Tiptap-document
 * voor `tasks.omschrijving`. Null als er niets te tonen is.
 */
export function todoOmschrijving(taak: Pick<TodoTaak, 'body' | 'linkedResources'>): Record<string, unknown> | null {
  const inhoud: Record<string, unknown>[] = []
  const tekst = taak.body?.contentType === 'html'
    ? (taak.body.content ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    : taak.body?.content ?? ''

  for (const regel of tekst.replace(/\r\n/g, '\n').split('\n')) {
    inhoud.push(regel.trim()
      ? { type: 'paragraph', content: [{ type: 'text', text: regel }] }
      : { type: 'paragraph' })
  }
  while (inhoud.length && !(inhoud[inhoud.length - 1] as { content?: unknown }).content) inhoud.pop()
  while (inhoud.length && !(inhoud[0] as { content?: unknown }).content) inhoud.shift()

  for (const bron of taak.linkedResources ?? []) {
    if (!bron.webUrl || !/^https:\/\//i.test(bron.webUrl)) continue
    inhoud.push({
      type: 'paragraph',
      content: [{
        type: 'text',
        text: bron.displayName?.trim() || 'Gekoppeld item openen',
        marks: [{ type: 'link', attrs: { href: bron.webUrl, target: '_blank' } }],
      }],
    })
  }

  return inhoud.length ? { type: 'doc', content: inhoud } : null
}
