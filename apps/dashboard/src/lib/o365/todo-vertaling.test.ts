import { describe, expect, it } from 'vitest'
import {
  todoNaarEvaStatus, evaNaarTodoStatus, todoNaarEvaPrioriteit,
  todoDeadline, evaDeadlineDag, todoOmschrijving,
} from './todo-vertaling'

describe('status', () => {
  it('vertaalt To Do naar EVA', () => {
    expect(todoNaarEvaStatus('notStarted')).toBe('open')
    expect(todoNaarEvaStatus('inProgress')).toBe('in_behandeling')
    expect(todoNaarEvaStatus('completed')).toBe('gereed')
    expect(todoNaarEvaStatus('waitingOnOthers')).toBe('wacht_op')
    expect(todoNaarEvaStatus('deferred')).toBe('open')
  })

  it('vinkt een vervallen EVA-actie af in To Do: hij is van tafel', () => {
    expect(evaNaarTodoStatus('vervallen')).toBe('completed')
    expect(evaNaarTodoStatus('gereed')).toBe('completed')
    expect(evaNaarTodoStatus('open')).toBe('notStarted')
  })

  it('komt voor elke gewone stand heen en terug op hetzelfde uit', () => {
    for (const s of ['open', 'in_behandeling', 'wacht_op', 'gereed'] as const) {
      expect(todoNaarEvaStatus(evaNaarTodoStatus(s))).toBe(s)
    }
  })
})

describe('prioriteit', () => {
  it('belangrijk in To Do is hoog in EVA', () => {
    expect(todoNaarEvaPrioriteit('high')).toBe('hoog')
    expect(todoNaarEvaPrioriteit('normal')).toBe('normaal')
    expect(todoNaarEvaPrioriteit('low')).toBe('normaal')
  })
})

describe('deadline', () => {
  /**
   * Graph geeft de deadline (met de Prefer-header) in Nederlandse tijd zonder offset. De dag
   * moet de dag blijven: als UTC-moment gelezen schoof een deadline van middernacht een dag
   * terug, precies de valkuil uit lib/planning/nl-tijd.ts.
   */
  it('neemt de kalenderdag over, ook rond middernacht en in de zomertijd', () => {
    expect(todoDeadline({ dateTime: '2026-10-14T00:00:00.0000000', timeZone: 'W. Europe Standard Time' })).toBe('2026-10-14')
    expect(todoDeadline({ dateTime: '2026-07-01T00:00:00.0000000', timeZone: 'W. Europe Standard Time' })).toBe('2026-07-01')
    expect(todoDeadline(null)).toBeNull()
    expect(todoDeadline(undefined)).toBeNull()
  })

  it('leest de EVA-deadline als dag, zoals hij als middernacht UTC is opgeslagen', () => {
    expect(evaDeadlineDag('2026-10-14T00:00:00+00:00')).toBe('2026-10-14')
    expect(evaDeadlineDag('2026-10-14')).toBe('2026-10-14')
    expect(evaDeadlineDag(null)).toBeNull()
  })
})

describe('omschrijving', () => {
  it('zet de notitie om in alinea’s, zonder lege randen', () => {
    expect(todoOmschrijving({ body: { content: '\nBel Jansen\n\nover de kozijnen\n', contentType: 'text' } })).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Bel Jansen' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'over de kozijnen' }] },
      ],
    })
  })

  it('maakt van een gekoppelde mail een link, en negeert niet-https', () => {
    const doc = todoOmschrijving({
      body: { content: '', contentType: 'text' },
      linkedResources: [
        { webUrl: 'https://outlook.office365.com/owa/?ItemID=abc', displayName: 'Mail van de VvE' },
        { webUrl: 'javascript:alert(1)', displayName: 'kwaad' },
      ],
    }) as { content: { content: { text: string; marks: { attrs: { href: string } }[] }[] }[] }
    expect(doc.content).toHaveLength(1)
    expect(doc.content[0].content[0].text).toBe('Mail van de VvE')
    expect(doc.content[0].content[0].marks[0].attrs.href).toBe('https://outlook.office365.com/owa/?ItemID=abc')
  })

  it('geeft null als er niets te tonen is', () => {
    expect(todoOmschrijving({ body: { content: '   ', contentType: 'text' } })).toBeNull()
  })
})
