import { NextRequest, NextResponse } from 'next/server'

import { cronLogboek } from '@/lib/cron/logboek'
import { verwerkBatch } from '@/lib/mailintake/verwerken'

/**
 * Ruim, want per bericht zitten hier een AI-aanroep (tot 120 s) en bij een
 * automatisch dossier ook nog een synchrone Bouw7-push in. Vandaar een kleine
 * batch en een royaal budget: liever vijf berichten netjes af dan twintig half.
 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/mailintake/verwerken
 *
 * Beoordeelt de opgehaalde berichten: triage, AI-extractie, afzenderherkenning,
 * duplicaatcontrole, besluit. Bijna alles komt uit op `wacht_op_mens` — dat is
 * de bedoeling, niet een gebrek.
 *
 * Elk bericht wordt eerst geclaimd (status → 'bezig') met een rowcount-controle;
 * dat is de grendel tegen dubbel verwerken als twee runs elkaar overlappen.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = cronLogboek('mailintake-verwerken')
  try {
    log.stap('batch verwerken')
    const resultaten = await verwerkBatch()

    const samenvatting = {
      verwerkt: resultaten.filter(r => r.status === 'verwerkt').length,
      voorgelegd: resultaten.filter(r => r.status === 'wacht_op_mens').length,
      geenAanvraag: resultaten.filter(r => r.status === 'geen_aanvraag').length,
      mislukt: resultaten.filter(r => r.status === 'mislukt').length,
      automatisch: resultaten.filter(r => r.automatisch).length,
      kostenCent: resultaten.reduce((s, r) => s + r.kostenCent, 0),
    }

    log.klaar(samenvatting)
    return NextResponse.json({ ok: true, ...samenvatting, resultaten, duurMs: log.duurMs() })
  } catch (e) {
    log.mislukt(e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
