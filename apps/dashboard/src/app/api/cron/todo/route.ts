import { NextRequest, NextResponse } from 'next/server'

import { cronLogboek } from '@/lib/cron/logboek'
import { todoActief } from '@/lib/o365/scopes'
import { medewerkersMetTodo, syncTodoVoorMedewerker, type TodoSyncResultaat } from '@/lib/o365/todo-sync'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Zoveel medewerkers tegelijk: Graph per gebruiker begrensd, en de functie heeft 60 s. */
const GELIJKTIJDIG = 4

/**
 * GET|POST /api/cron/todo
 *
 * Haalt per medewerker wat er in Microsoft To Do veranderde en zet dat in Mijn acties
 * (lib/o365/todo-sync.ts). Elke vijf minuten; Mijn acties zelf synchroniseert daarnaast
 * bij het openen, zodat een net aangemaakte taak niet op de cron hoeft te wachten.
 *
 * Een fout bij één medewerker (koppeling verlopen, Graph hapert) stopt de rest niet.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!todoActief()) return NextResponse.json({ ok: true, uit: true })

  const log = cronLogboek('todo')
  try {
    log.stap('medewerkers ophalen')
    const ids = await medewerkersMetTodo()

    const resultaten: TodoSyncResultaat[] = []
    let volgende = 0
    const werker = async () => {
      while (volgende < ids.length) {
        const id = ids[volgende++]
        log.stap(`medewerker ${id}`)
        try {
          resultaten.push(await syncTodoVoorMedewerker(id))
        } catch (e) {
          resultaten.push({
            medewerkerId: id, lijsten: 0, nieuw: 0, bijgewerkt: 0, vervallen: 0,
            fout: e instanceof Error ? e.message.slice(0, 300) : String(e),
          })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(GELIJKTIJDIG, ids.length) }, werker))

    const som = (k: 'nieuw' | 'bijgewerkt' | 'vervallen') => resultaten.reduce((s, r) => s + r[k], 0)
    const fouten = resultaten.filter(r => r.fout)
    log.klaar({ medewerkers: ids.length, nieuw: som('nieuw'), bijgewerkt: som('bijgewerkt'), vervallen: som('vervallen'), fouten: fouten.length })
    return NextResponse.json({ ok: fouten.length === 0, resultaten, duurMs: log.duurMs() })
  } catch (e) {
    log.mislukt(e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
