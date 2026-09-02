import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@everts/database/server'
import { verstuurMailViaGedeeldePostbus } from '@/lib/o365/mail'
import { LINK_PLAATSHOUDER, maakInloglink } from '@/lib/portaal/mail'
import { appBaseUrl } from '@/lib/app-url'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Na drie mislukte pogingen blijft een rij staan als 'mislukt' — dan is er iets structureel mis. */
const MAX_POGINGEN = 3
/** Hoeveel mails per run. Ruim boven het normale volume; de grens is er tegen een op hol geslagen wachtrij. */
const BATCH = 25

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * GET|POST /api/cron/portaal-mail
 *
 * Verstuurt de klaarstaande portaalmail. Anders dan /api/cron/oplevering kán
 * deze cron wél zelf versturen: portaalmail gaat via de gedeelde postbus met
 * app-only Graph en heeft dus geen ingelogde medewerker nodig.
 *
 * De inloglink wordt hier pas gemaakt, vlak vóór verzending. In de wachtrij
 * staat alleen een plaatshouder — een magic link is kort geldig en zou verlopen
 * zijn tegen de tijd dat een achterlopende wachtrij hem verstuurt.
 *
 * Beveiliging: Authorization: Bearer <CRON_SECRET>.
 */
async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = db()
  const gestart = Date.now()
  let verzonden = 0
  let mislukt = 0

  const { data: rijen, error } = await supabase
    .from('portaal_mail_wachtrij')
    .select('id, soort, ontvangers, cc, onderwerp, body_html, pogingen, portaal_gebruiker_id')
    .eq('status', 'wachtend')
    .lt('pogingen', MAX_POGINGEN)
    .order('created_at')
    .limit(BATCH)

  if (error) {
    return NextResponse.json({ error: `Wachtrij lezen mislukt: ${error.message}` }, { status: 500 })
  }

  for (const rij of (rijen ?? []) as {
    id: string; soort: string; ontvangers: string[]; cc: string[] | null
    onderwerp: string; body_html: string | null; pogingen: number; portaal_gebruiker_id: string | null
  }[]) {
    try {
      let body = rij.body_html ?? ''

      if (body.includes(LINK_PLAATSHOUDER)) {
        // Eén link per mail, voor de eerste ontvanger: een magic link hoort bij
        // één persoon. Staan er meer adressen op, dan krijgen die alleen de
        // algemene portaallink — inloggen doen ze met hun eigen aanvraag.
        const [eerste, ...rest] = rij.ontvangers
        const link = await maakInloglink(eerste)
        body = body.split(LINK_PLAATSHOUDER).join(link)
        if (rest.length > 0) {
          // Geen persoonlijke link naar een tweede ontvanger sturen.
          await supabase.from('portaal_mail_wachtrij')
            .update({ ontvangers: [eerste] }).eq('id', rij.id)
        }
        await verstuurMailViaGedeeldePostbus({
          to: [eerste],
          cc: rij.cc ?? [],
          subject: rij.onderwerp,
          bodyHtml: body,
        })
      } else {
        await verstuurMailViaGedeeldePostbus({
          to: rij.ontvangers,
          cc: rij.cc ?? [],
          subject: rij.onderwerp,
          bodyHtml: body.split(LINK_PLAATSHOUDER).join(`${appBaseUrl()}/portaal`),
        })
      }

      await supabase.from('portaal_mail_wachtrij')
        .update({ status: 'verzonden', verzonden_op: new Date().toISOString(), pogingen: rij.pogingen + 1 })
        .eq('id', rij.id)
      verzonden++
    } catch (e) {
      const pogingen = rij.pogingen + 1
      await supabase.from('portaal_mail_wachtrij')
        .update({
          pogingen,
          laatste_fout: e instanceof Error ? e.message.slice(0, 500) : 'Onbekende fout',
          // Pas na de laatste poging definitief op mislukt: een tijdelijke
          // Graph-storing mag geen uitnodiging weggooien.
          status: pogingen >= MAX_POGINGEN ? 'mislukt' : 'wachtend',
        })
        .eq('id', rij.id)
      mislukt++
    }
  }

  return NextResponse.json({
    ok: true, verzonden, mislukt, duurMs: Date.now() - gestart,
  })
}

export const GET = handle
export const POST = handle
