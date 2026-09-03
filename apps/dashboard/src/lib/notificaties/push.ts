import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@everts/database/server'
import { logFout } from '@/lib/fouten/log'
import { isMobileUA } from '@/lib/isMobileUA'

/**
 * Pushmeldingen (Web Push / VAPID).
 *
 * Elke in-app notificatie gaat langs `stuurPush()` en komt zo ook op de telefoon
 * binnen — ook als EVA dicht staat. De browser van de gebruiker heeft zich daarvoor
 * eerder aangemeld (zie /api/push/aanmelden); die abonnementen staan in
 * `push_abonnementen`, één rij per apparaat.
 *
 * Twee dingen om te weten:
 *   * Zonder VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in de omgeving doet deze module
 *     helemaal niets. Dat is bewust: op een omgeving zonder sleutels moet EVA gewoon
 *     werken, alleen zonder push.
 *   * Deze module gooit NOOIT. Hij hangt achter acties die er niet op mogen stuklopen:
 *     een goedgekeurde begroting, een afgeronde sync, een cron-run.
 */

export type PushPayload = {
  titel: string
  body?: string | null
  /** Pad binnen EVA waar de melding heen leidt, bijv. '/opdrachten/123'. */
  url?: string | null
  /** Notificatie-type; bepaalt het icoontje in de melding. */
  type?: string | null
  /** Id van de bijbehorende rij in `notificaties` — de SW gebruikt het als tag. */
  id?: string | null
}

type Abonnement = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  mobiel: boolean | null
}

/** Dossier-secties op de desktop; op mobiel is er één dossierscherm. */
const DOSSIER_SECTIES = ['aanvragen', 'offertes', 'opdrachten', 'servicedesk']

/**
 * Vertaalt een desktop-pad naar het mobiele equivalent.
 *
 * Nodig omdat de middleware een telefoon vanaf elke desktop-route naar `/m` stuurt.
 * Zonder deze vertaling landt élke aangetikte pushmelding op het startscherm in
 * plaats van bij de melding — de melding zegt dan wel wát er is, maar brengt je er
 * niet heen. De user-agent staat per abonnement vast, dus dit kan per apparaat.
 *
 * Alleen paden waarvan een mobiel scherm bestaat worden omgezet; de rest gaat naar
 * het meldingenscherm, want daar staat de melding in elk geval nog een keer.
 */
export function naarMobielPad(pad: string): string {
  if (!pad || pad.startsWith('/m/') || pad === '/m') return pad || '/m'

  const [zonderQuery] = pad.split(/[?#]/)
  const delen = zonderQuery.split('/').filter(Boolean)

  if (delen.length >= 2 && DOSSIER_SECTIES.includes(delen[0])) {
    return `/m/dossiers/${delen[1]}`
  }
  if (delen[0] === 'taken') return '/m/taken'
  if (delen[0] === 'uren') return '/m/uren'
  if (delen[0] === 'planning') return '/m/planning'

  return '/m/notificaties'
}

/**
 * Waarom push niet werkt, als het niet werkt. Wordt tot in het scherm doorgegeven:
 * "staat niet ingesteld" is als melding waardeloos wanneer je niet weet óf de
 * sleutels ontbreken óf ze worden afgewezen.
 */
export type VapidStand =
  | { ok: true }
  | { ok: false; reden: 'geen-sleutels' | 'ongeldig' }

let stand: VapidStand | null = null

/** Zet de VAPID-gegevens één keer per proces. */
function vapidStand(): VapidStand {
  if (stand !== null) return stand

  const publiek = process.env.VAPID_PUBLIC_KEY
  const prive = process.env.VAPID_PRIVATE_KEY
  if (!publiek || !prive) {
    stand = { ok: false, reden: 'geen-sleutels' }
    return stand
  }

  // Het subject is verplicht in de VAPID-spec: een mailto: of https: waarmee de
  // pushdienst de afzender kan bereiken bij problemen. Zonder eigen instelling
  // valt hij terug op het adres van de app zelf.
  const app = process.env.NEXT_PUBLIC_APP_URL
  const subject =
    process.env.VAPID_SUBJECT ||
    (app?.startsWith('https://') ? app.replace(/\/+$/, '') : 'https://eva.everts.chat')

  try {
    webpush.setVapidDetails(subject, publiek, prive)
    stand = { ok: true }
  } catch (fout) {
    stand = { ok: false, reden: 'ongeldig' }
    // Naar het foutenlogboek: dit is de enige plek waar staat wat er precies mis
    // is met de sleutels, en zonder dit zoek je het in de omgeving in plaats van
    // in de waarde. Sleutels zelf gaan er niet in, alleen hun vorm.
    void logFout({
      omgeving: 'server',
      bron: 'lib/notificaties/push',
      melding: `VAPID-instelling geweigerd: ${(fout as Error)?.message ?? 'onbekend'}`,
      extra: {
        subject,
        publiekeSleutelLengte: publiek.length,
        priveSleutelLengte: prive.length,
      },
    })
  }
  return stand
}

/** Is push op deze omgeving geconfigureerd? Gebruikt door /api/push/sleutel. */
export function pushBeschikbaar(): VapidStand {
  return vapidStand()
}

/**
 * Stuur één melding naar alle apparaten van een gebruiker.
 *
 * Geeft het aantal apparaten terug dat de melding heeft aangenomen. Abonnementen die
 * de pushdienst als verlopen afwijst (404/410 — app verwijderd, toestemming
 * ingetrokken) worden meteen opgeruimd; anders blijft EVA eindeloos naar een dood
 * endpoint sturen.
 */
export async function stuurPush(userId: string, payload: PushPayload): Promise<number> {
  if (!userId || !vapidStand().ok) return 0

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('push_abonnementen')
      .select('id, endpoint, p256dh, auth, user_agent, mobiel')
      .eq('user_id', userId)

    const abonnementen = (data ?? []) as Abonnement[]
    if (abonnementen.length === 0) return 0

    const doel = payload.url ?? '/'

    // Aantal ongelezen meldingen gaat mee, zodat de service worker het tellertje
    // op het app-icoon kan bijwerken terwijl EVA dicht staat. Op dit moment staat
    // de zojuist aangemaakte melding er al in.
    const { count } = await admin
      .from('notificaties')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('gelezen', false)
    const ongelezen = count ?? 0

    const verlopen: string[] = []
    let gelukt = 0

    await Promise.all(
      abonnementen.map(async (ab) => {
        // Per apparaat: telefoons en tablets krijgen het mobiele pad mee, de rest
        // het gewone. De vlag van de browser gaat vóór de user-agent — die liegt op
        // iOS en iPadOS (zie isMobielApparaat in lib/mobiel-apparaat.ts). Alleen bij
        // oudere abonnementen zonder vlag valt hij terug op de user-agent; die komen
        // via de middleware alsnog goed uit, want die kent het apparaat-cookie.
        const naarMobiel = ab.mobiel ?? isMobileUA(ab.user_agent)
        const bericht = JSON.stringify({
          titel: payload.titel,
          body: payload.body ?? '',
          url: naarMobiel ? naarMobielPad(doel) : doel,
          type: payload.type ?? 'algemeen',
          id: payload.id ?? null,
          ongelezen,
        })

        try {
          await webpush.sendNotification(
            { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
            bericht,
            { TTL: 24 * 60 * 60 },
          )
          gelukt++
        } catch (fout) {
          const status = (fout as { statusCode?: number })?.statusCode
          if (status === 404 || status === 410) {
            verlopen.push(ab.id)
          } else {
            await logFout({
              omgeving: 'server',
              bron: 'lib/notificaties/push',
              melding: `Push mislukt (status ${status ?? '?'}): ${(fout as Error)?.message ?? 'onbekend'}`,
              extra: { userId, endpoint: ab.endpoint.slice(0, 80) },
            })
          }
        }
      }),
    )

    if (verlopen.length > 0) {
      await admin.from('push_abonnementen').delete().in('id', verlopen)
    }
    if (gelukt > 0) {
      await admin
        .from('push_abonnementen')
        .update({ laatst_gebruikt: new Date().toISOString() })
        .eq('user_id', userId)
    }

    return gelukt
  } catch {
    // Stil falen: push is een extra kanaal, geen voorwaarde voor de actie eromheen.
    return 0
  }
}
