import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { zetToolboxKlaar, doelgroepMedewerkers } from '@/lib/toolbox/klaarzetten'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * GET|POST /api/cron/toolbox-momenten
 *
 * Zet toolboxen klaar op de dag van hun agenda-moment. Voor elk gekoppeld
 * `toolbox_moment` met status 'gepland' en datum ≤ vandaag: bepaal de doelgroep
 * van het agenda-item, maak per doelgroep-medewerker een toewijzing + openstaande
 * taak aan (idempotent), en zet het moment op 'klaargezet'.
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
  const vandaag = new Date().toISOString().slice(0, 10)
  let klaargezet = 0
  let toewijzingen = 0

  try {
    const { data: momenten } = await supabase
      .from('toolbox_momenten')
      .select('id, agenda_item_id, toolbox_id')
      .eq('status', 'gepland')
      .lte('datum', vandaag)

    for (const m of (momenten ?? []) as { id: string; agenda_item_id: string; toolbox_id: string }[]) {
      // Laatste gepubliceerde versie van de toolbox.
      const { data: tb } = await supabase
        .from('toolboxen')
        .select('titel, status, huidige_versie')
        .eq('id', m.toolbox_id)
        .maybeSingle()
      if (!tb || tb.status !== 'gepubliceerd') continue

      const { data: versie } = await supabase
        .from('toolbox_versies')
        .select('id')
        .eq('toolbox_id', m.toolbox_id)
        .eq('versienummer', tb.huidige_versie)
        .maybeSingle()
      if (!versie) continue

      const medewerkerIds = await doelgroepMedewerkers(m.agenda_item_id)
      const res = await zetToolboxKlaar({
        toolboxId: m.toolbox_id,
        versieId: versie.id,
        titel: tb.titel,
        medewerkerIds,
        momentId: m.id,
      })
      toewijzingen += res.aangemaakt

      await supabase
        .from('toolbox_momenten')
        .update({ status: 'klaargezet', klaargezet_op: new Date().toISOString() })
        .eq('id', m.id)
      klaargezet++
    }

    return NextResponse.json({
      ok: true,
      klaargezette_momenten: klaargezet,
      nieuwe_toewijzingen: toewijzingen,
      duur_ms: Date.now() - startedAt,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), duur_ms: Date.now() - startedAt },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
