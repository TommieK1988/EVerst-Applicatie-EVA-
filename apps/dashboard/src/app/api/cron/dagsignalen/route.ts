import { NextRequest, NextResponse } from 'next/server'
import { amsterdamUur } from '@/lib/cron/lokaal-venster'
import { cronLogboek } from '@/lib/cron/logboek'
import { stuurDagsignalen, type Run } from '@/lib/notificaties/dagsignalen'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Beoogde lokale (Europe/Amsterdam) starttijden. */
const OCHTEND_UUR = 7
const MIDDAG_UUR = 15

/**
 * GET|POST /api/cron/dagsignalen
 *
 * Stuurt de dagelijkse meldingen over acties, planning en uren. Wat er precies
 * wanneer uitgaat staat in `lib/notificaties/dagsignalen.ts`; deze route doet
 * alleen de bewaking en de klok.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 *
 * Draait twee keer per werkdag (07:00 en 15:00 lokaal). Net als de andere crons
 * vuurt hij op twee UTC-uren per moment zodat er het hele jaar één op het bedoelde
 * lokale uur valt; de tegenhanger slaat over. Alleen GET (= Vercel Cron) dwingt dat
 * venster af, zodat een handmatige POST altijd te draaien is — die telt dan als de
 * ochtendronde, want dat is de volledige.
 */
async function handle(req: NextRequest, enforceLocalWindow = false): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const uur = amsterdamUur()
  let run: Run = 'ochtend'

  if (enforceLocalWindow) {
    if (uur !== OCHTEND_UUR && uur !== MIDDAG_UUR) {
      // 200 zodat Vercel deze bedoelde no-op niet als mislukte cron markeert.
      console.log('[cron dagsignalen] overgeslagen — buiten lokaal venster')
      return NextResponse.json({ ok: true, skipped: true, reason: 'buiten lokaal venster' }, { status: 200 })
    }
    run = uur === MIDDAG_UUR ? 'middag' : 'ochtend'
  }

  const log = cronLogboek('dagsignalen')
  const startedAt = Date.now()

  try {
    const resultaat = await stuurDagsignalen(run, log)
    log.klaar({ ...resultaat, fouten: resultaat.fouten.length })
    return NextResponse.json({ ok: true, ...resultaat, duur_ms: Date.now() - startedAt })
  } catch (err) {
    log.mislukt(err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }
}

export const GET = (req: NextRequest) => handle(req, true)
export const POST = (req: NextRequest) => handle(req)
