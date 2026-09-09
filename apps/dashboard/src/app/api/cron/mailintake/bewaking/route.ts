import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'

import { cronLogboek } from '@/lib/cron/logboek'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { herstelVastgelopenClaims } from '@/lib/mailintake/verwerken'
import { voerNabehandelingUit, MAX_OUTLOOK_POGINGEN } from '@/lib/mailintake/nabehandeling'
import { zetBijlagenInSharePoint } from '@/lib/mailintake/aanmaken'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Twee werkdagen; ruwweg, want een exacte werkdagenkalender is hier overdaad. */
const BLIJFT_LIGGEN_UREN = 48
/** Een postbus die zó lang niets ophaalde, is verdacht. */
const POSTBUS_STIL_UREN = 6
/** Bijlagen van afgehandelde berichten opruimen na deze termijn. */
const BEWAARTERMIJN_DAGEN = 90

async function ontvangersVoor(postbusId: string): Promise<string[]> {
  const supabase = db()
  const { data: p } = await supabase
    .from('mailintake_postbussen').select('notificatie_medewerkers').eq('id', postbusId).maybeSingle()
  const ids: string[] = p?.notificatie_medewerkers ?? []
  if (!ids.length) return []
  const { data } = await supabase
    .from('medewerkers').select('auth_user_id').in('id', ids)
    .eq('actief', true).not('auth_user_id', 'is', null).limit(50)
  return (data ?? []).map((m: any) => m.auth_user_id)
}

/**
 * GET|POST /api/cron/mailintake/bewaking
 *
 * De nacontroles. Dit is het deel dat voorkomt dat fouten stil blijven:
 * vastgelopen verwerkingen, mail die niemand oppakt, een postbus die zwijgt,
 * en verplaatsingen die niet lukten.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log = cronLogboek('mailintake-bewaking')
  const supabase = db()
  const rapport: Record<string, unknown> = {}

  try {
    // ── 1. Vastgelopen claims terugzetten ──────────────────────────────────
    log.stap('vastgelopen claims')
    rapport.claimsHersteld = await herstelVastgelopenClaims()

    // ── 2. Outlook-nabehandeling opnieuw proberen ──────────────────────────
    // Een mislukte verplaatsing draait nooit het dossier terug; hij komt hier
    // gewoon nog een paar keer langs.
    log.stap('nabehandeling opnieuw')
    const { data: openstaand } = await supabase
      .from('mailintake_berichten')
      .select('id')
      .in('outlook_nabehandeling', ['open', 'mislukt'])
      .lt('outlook_pogingen', MAX_OUTLOOK_POGINGEN)
      .order('behandeld_op', { ascending: true })
      .limit(50)

    let hersteld = 0
    for (const b of openstaand ?? []) {
      const res = await voerNabehandelingUit(b.id)
      if (res.gedaan) hersteld++
    }
    rapport.nabehandelingHersteld = hersteld
    rapport.nabehandelingOpen = (openstaand ?? []).length

    // Wat het na drie pogingen niet haalt, is structureel: meld het één keer.
    const { data: opgegeven } = await supabase
      .from('mailintake_berichten')
      .select('id, postbus_id, outlook_fout')
      .eq('outlook_nabehandeling', 'mislukt')
      .gte('outlook_pogingen', MAX_OUTLOOK_POGINGEN)
      .limit(20)
    rapport.nabehandelingOpgegeven = (opgegeven ?? []).length

    if ((opgegeven ?? []).length) {
      const perPostbus = new Set((opgegeven ?? []).map((o: any) => o.postbus_id))
      for (const pid of perPostbus) {
        for (const user of await ontvangersVoor(pid as string)) {
          await maakNotificatie({
            user_id: user,
            type: 'mailintake_mislukt',
            titel: 'Mailintake: berichten konden niet worden verplaatst',
            body: 'Controleer of de map "Verwerkt door EVA" nog bestaat en of de machtiging nog geldt.',
            url: '/instellingen/mailintake',
          })
        }
      }
    }

    // ── 3. Blijft liggen ───────────────────────────────────────────────────
    log.stap('blijft liggen')
    const grens = new Date(Date.now() - BLIJFT_LIGGEN_UREN * 3600 * 1000).toISOString()
    const { data: oud } = await supabase
      .from('mailintake_berichten')
      .select('id, postbus_id')
      .eq('status', 'wacht_op_mens')
      .lt('ontvangen_op', grens)
      .limit(500)

    rapport.blijftLiggen = (oud ?? []).length
    const perPostbus = new Map<string, number>()
    for (const b of oud ?? []) perPostbus.set(b.postbus_id, (perPostbus.get(b.postbus_id) ?? 0) + 1)

    for (const [pid, aantal] of perPostbus) {
      for (const user of await ontvangersVoor(pid)) {
        await maakNotificatie({
          user_id: user,
          type: 'mailintake_blijft_liggen',
          titel: `${aantal} ${aantal === 1 ? 'bericht wacht' : 'berichten wachten'} al langer dan twee dagen`,
          body: 'Open het postvak om ze af te handelen.',
          url: '/mailintake?tab=te_behandelen',
        })
      }
    }

    // ── 4. Postbusgezondheid ───────────────────────────────────────────────
    log.stap('postbusgezondheid')
    const stilGrens = new Date(Date.now() - POSTBUS_STIL_UREN * 3600 * 1000).toISOString()
    const { data: postbussen } = await supabase
      .from('mailintake_postbussen')
      .select('id, naam, laatste_ophaal_op, laatste_fout')
      .eq('actief', true)
      .limit(20)

    const stil = (postbussen ?? []).filter(
      (p: any) => p.laatste_fout || !p.laatste_ophaal_op || p.laatste_ophaal_op < stilGrens,
    )
    rapport.postbussenStil = stil.length

    for (const p of stil) {
      for (const user of await ontvangersVoor(p.id)) {
        await maakNotificatie({
          user_id: user,
          type: 'mailintake_mislukt',
          titel: `Mailintake: ${p.naam} kon niet worden gelezen`,
          body: p.laatste_fout ?? 'Er is al enkele uren niets opgehaald uit deze postbus.',
          url: '/instellingen/mailintake',
        })
      }
    }

    // ── 5. Bijlagen die niet in SharePoint landden ─────────────────────────
    // Een stille faalmodus: het dossier bestaat, de opdrachtbon niet. Zonder deze
    // herkansing merkt niemand dat, want in EVA ziet het dossier er compleet uit.
    log.stap('bijlagen naar sharepoint')
    const { data: achtergebleven } = await supabase
      .from('mailintake_bijlagen')
      .select('bericht_id, bericht:mailintake_berichten!inner(dossier_id)')
      .is('naar_sharepoint_op', null)
      .not('opslag_pad', 'is', null)
      .not('bericht.dossier_id', 'is', null)
      .limit(200)

    const perBericht = new Map<string, string>()
    for (const b of achtergebleven ?? []) {
      const did = (b as any).bericht?.dossier_id
      if (did) perBericht.set(b.bericht_id, did)
    }

    let bijlagenGeplaatst = 0
    for (const [berichtId, dossierId] of perBericht) {
      const res = await zetBijlagenInSharePoint(berichtId, dossierId)
      bijlagenGeplaatst += res.geuploaded
    }
    rapport.bijlagenAlsnogGeplaatst = bijlagenGeplaatst
    rapport.berichtenMetOpenBijlagen = perBericht.size

    // ── 6. Bijlagen opruimen ───────────────────────────────────────────────
    // De bucket groeit hard (25 MB per bijlage). Wat is afgehandeld en oud is,
    // hoeft hier niet te blijven staan; het dossier is de bewaarplaats.
    log.stap('bijlagen opruimen')
    const oudGrens = new Date(Date.now() - BEWAARTERMIJN_DAGEN * 24 * 3600 * 1000).toISOString()
    const { data: teOud } = await supabase
      .from('mailintake_bijlagen')
      .select('id, opslag_pad, naar_sharepoint_op, bericht:mailintake_berichten!inner(status, behandeld_op, dossier_id)')
      .not('opslag_pad', 'is', null)
      .in('bericht.status', ['verwerkt', 'genegeerd', 'geen_aanvraag'])
      .lt('bericht.behandeld_op', oudGrens)
      .limit(200)

    // Deze voorwaarde staat bewust hier en niet in de query: een `.or()` die naar
    // een ingesloten tabel verwijst is in PostgREST net anders dan hij eruitziet,
    // en dit is te belangrijk om op een subtiliteit te laten stukgaan.
    //
    // Weggooien mag alleen als de bijlage ergens anders bewaard is (SharePoint) of
    // als er nooit een dossier kwam (genegeerd, geen aanvraag). Hangt er wél een
    // dossier aan maar staat het bestand nog niet in SharePoint, dan is dit de
    // enige kopie die er nog is.
    const mag = (b: any) => Boolean(b.naar_sharepoint_op) || !b.bericht?.dossier_id
    const opruimbaar = (teOud ?? []).filter(mag)

    let opgeruimd = 0
    const paden = opruimbaar.map((b: any) => b.opslag_pad).filter(Boolean)
    if (paden.length) {
      const { error } = await supabase.storage.from('mail-intake').remove(paden)
      if (!error) {
        await supabase.from('mailintake_bijlagen')
          .update({ opslag_pad: null })
          .in('id', opruimbaar.map((b: any) => b.id))
        opgeruimd = paden.length
      }
    }
    rapport.bijlagenOpgeruimd = opgeruimd
    rapport.bijlagenBewaardVoorSharePoint = (teOud ?? []).length - opruimbaar.length

    log.klaar(rapport)
    return NextResponse.json({ ok: true, ...rapport, duurMs: log.duurMs() })
  } catch (e) {
    log.mislukt(e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), ...rapport },
      { status: 500 },
    )
  }
}

export const GET = handle
export const POST = handle
