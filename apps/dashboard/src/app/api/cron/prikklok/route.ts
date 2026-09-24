import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { cronLogboek } from '@/lib/cron/logboek'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { getRooster } from '@/lib/uren/rooster'
import { getPrikklokInstellingen } from '@/lib/prikklok/auth'
import { amsterdamDatum, amsterdamMoment } from '@/lib/prikklok/tijd'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const db = () => createAdminClient()

/** Zonder rooster geldt dit als einde van de werkdag. */
const STANDAARD_DAGEIND = '17:00'

/**
 * GET|POST /api/cron/prikklok
 *
 * Herinnering "je bent nog ingeklokt". Voor elke open sessie van vandaag: is het roostereinde
 * plus `herinnering_na_min` voorbij, dan één pushmelding, en `herinnerd_op` voorkomt een tweede.
 *
 * Er wordt hier bewust níets afgesloten. Wie vergeet uit te klokken, geeft bij de volgende keer
 * openen zelf zijn vertrektijd op (zie `meldVertrokken`); EVA verzint geen eindtijd.
 *
 * Draait elk uur van 14 tot en met 19 UTC (16–21 uur zomertijd, 15–20 uur wintertijd). Een lokaal
 * venster is niet nodig: de route kijkt per sessie zelf of het moment al daar is, dus een extra
 * run doet gewoon niets.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = cronLogboek('prikklok')
  try {
    const nu = new Date()
    const vandaag = amsterdamDatum(nu)
    const inst = await getPrikklokInstellingen()

    const { data } = await db()
      .from('prikklok_sessies')
      .select('id, medewerker_id, datum, dossiers ( dossiernummer, titel ), medewerkers ( auth_user_id )')
      .is('uit_op', null)
      .is('herinnerd_op', null)
      .eq('datum', vandaag)
      .limit(500)

    let verstuurd = 0
    for (const s of data ?? []) {
      const rooster = await getRooster(s.medewerker_id, s.datum).catch(() => null)
      const eind = (rooster?.dageind ?? STANDAARD_DAGEIND).slice(0, 5)
      const moment = amsterdamMoment(s.datum, eind).getTime() + inst.herinnering_na_min * 60_000
      if (nu.getTime() < moment) continue

      const userId = s.medewerkers?.auth_user_id
      if (userId) {
        const label = [s.dossiers?.dossiernummer, s.dossiers?.titel].filter(Boolean).join(' · ')
        await maakNotificatie({
          user_id: userId,
          type: 'prikklok_herinnering',
          titel: 'Je bent nog ingeklokt',
          body: `${label || 'Werkadres'} — vergeet niet uit te klokken.`,
          url: '/m/prikklok',
        })
        verstuurd++
      }
      await db().from('prikklok_sessies').update({ herinnerd_op: nu.toISOString() }).eq('id', s.id)
    }

    log.klaar({ open: (data ?? []).length, verstuurd })
    return NextResponse.json({ ok: true, open: (data ?? []).length, verstuurd })
  } catch (e) {
    log.mislukt(e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
