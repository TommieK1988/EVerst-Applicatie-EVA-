import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { leesGoedkeuringTerug, stuurUrenWeekNaarBouw7 } from '@/lib/uren/bouw7'
import { schrijfVerlofNaarBouw7 } from '@/lib/uren/verlof'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * GET|POST /api/cron/uren
 *
 * Houdt de urenverantwoording en Bouw7 op één lijn. Twee taken:
 *
 *  1. De goedkeurvlag teruglezen. Zolang er in Bouw7 geaccordeerd wordt, is dat de enige manier
 *     waarop EVA merkt dat een week rond is. Draait iemand een goedkeuring daar terug, dan zakt
 *     de week hier ook terug -- EVA mag geen goedkeuring tonen die niet meer bestaat.
 *
 *  2. Blijven hangen regels opnieuw versturen. Een week kan goedgekeurd zijn terwijl een deel van
 *     de regels bij Bouw7 struikelde (netwerk, een ontbrekende koppeling). Die staan op 'fout' en
 *     krijgen hier een nieuwe kans. Dat is veilig: `bouw7_hour_log_id` maakt van een tweede poging
 *     een update in plaats van een duplicaat.
 *
 *  3. Hetzelfde voor goedgekeurd verlof dat niet als day-off in Bouw7 aankwam. Het verlof geldt in
 *     EVA al -- de goedkeuring is fail-soft -- maar Bouw7 moet het uiteindelijk ook weten, anders
 *     staat de monteur daar nog als beschikbaar.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const supabase = db()

  try {
    const terug = await leesGoedkeuringTerug(60)

    // Goedgekeurde weken waarvan nog regels openstaan bij Bouw7. Begrensd op 50 zodat één slechte
    // dag de cron niet over zijn tijdslimiet duwt; de rest volgt de run erna.
    const { data: hangend } = await supabase
      .from('uren_regels')
      .select('week_id, uren_weken!inner(status)')
      .in('bouw7_status', ['fout', 'niet_verzonden'])
      .eq('uren_weken.status', 'goedgekeurd')
      .limit(500)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weekIds = [...new Set(((hangend ?? []) as any[]).map(r => r.week_id))].slice(0, 50)

    let herverzonden = 0
    let mislukt = 0
    for (const weekId of weekIds) {
      const res = await stuurUrenWeekNaarBouw7(weekId as string)
      herverzonden += res.verzonden
      mislukt += res.mislukt
    }

    // Goedgekeurd verlof dat Bouw7 niet accepteerde. Begrensd, net als hierboven.
    const { data: hangendVerlof } = await supabase
      .from('verlof_aanvragen')
      .select('id')
      .eq('status', 'goedgekeurd')
      .in('bouw7_status', ['fout', 'niet_verzonden'])
      .limit(50)

    let verlofVerzonden = 0
    let verlofMislukt = 0
    for (const v of ((hangendVerlof ?? []) as Array<{ id: string }>)) {
      if (await schrijfVerlofNaarBouw7(v.id)) verlofVerzonden++
      else verlofMislukt++
    }

    return NextResponse.json({
      ok: true,
      duurMs: Date.now() - startedAt,
      goedkeuring: terug,
      herverzonden,
      mislukt,
      wekenOpnieuwGeprobeerd: weekIds.length,
      verlofVerzonden,
      verlofMislukt,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout', duurMs: Date.now() - startedAt },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
