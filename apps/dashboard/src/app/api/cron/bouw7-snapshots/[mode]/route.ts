import { NextRequest, NextResponse } from 'next/server'
import { warmSnapshots, type WarmModus } from '@/lib/bouw7/warm-snapshots'
import { binnenLokaalUur } from '@/lib/cron/lokaal-venster'

// Warmen doet honderden Bouw7-calls; de warmer bewaakt zelf een budget van 240 s.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET|POST /api/cron/bouw7-snapshots/alles | /dossiers | /overig
 *
 * Vult de Bouw7-snapshots waaruit EVA's schermen lezen. Draait kort ná de reguliere sync, zodat
 * de dossierlijst al bij is voordat we per dossier de details ophalen.
 *
 * De modus zit in het PAD, niet in een query-string: Vercel Cron registreert paden met `?query=`
 * niet. 'alles' is de normale ronde; 'dossiers' en 'overig' bestaan om het werk te splitsen zodra
 * één ronde niet meer binnen het venster past — dat is dan alleen een vercel.json-wijziging.
 *
 * Net als bij bouw7-sync vuurt de cron op twee UTC-uren per dag zodat er het hele jaar door één
 * op het bedoelde lokale uur valt; de tegenhanger slaat over. Alleen GET (= Vercel Cron) dwingt
 * dat venster af, POST (curl-test) draait altijd.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */

/** Beoogde lokale (Europe/Amsterdam) starttijden: 07:00 na de full sync, 13:15 na de incremental. */
const DOEL_LOKALE_UREN = [7, 13]

function leesModus(mode: string): WarmModus {
  return mode === 'dossiers' || mode === 'overig' ? mode : 'alles'
}

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ mode: string }> },
  enforceLocalWindow: boolean,
): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mode } = await ctx.params
  const modus = leesModus(mode)

  if (enforceLocalWindow && !binnenLokaalUur(DOEL_LOKALE_UREN)) {
    // 200 zodat Vercel deze bedoelde no-op niet als mislukte cron markeert.
    return NextResponse.json(
      { ok: true, skipped: true, modus, reason: 'buiten lokaal venster' },
      { status: 200 },
    )
  }

  try {
    const resultaat = await warmSnapshots(modus)
    return NextResponse.json({ ok: true, ...resultaat }, { status: 200 })
  } catch (e) {
    return NextResponse.json(
      { ok: false, modus, error: e instanceof Error ? e.message : 'Onbekende fout' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ mode: string }> }) {
  return handle(req, ctx, true)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ mode: string }> }) {
  return handle(req, ctx, false)
}
