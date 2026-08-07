import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@everts/database/server'
import { logFout } from '@/lib/fouten/log'

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
}

let ingesteld: boolean | null = null

/** Zet de VAPID-gegevens één keer per proces. Geeft false als er geen sleutels zijn. */
function vapidGereed(): boolean {
  if (ingesteld !== null) return ingesteld

  const publiek = process.env.VAPID_PUBLIC_KEY
  const prive = process.env.VAPID_PRIVATE_KEY
  if (!publiek || !prive) {
    ingesteld = false
    return false
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
    ingesteld = true
  } catch {
    ingesteld = false
  }
  return ingesteld
}

/** Is push op deze omgeving geconfigureerd? Gebruikt door /api/push/sleutel. */
export function pushBeschikbaar(): boolean {
  return vapidGereed()
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
  if (!userId || !vapidGereed()) return 0

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('push_abonnementen')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId)

    const abonnementen = (data ?? []) as Abonnement[]
    if (abonnementen.length === 0) return 0

    const bericht = JSON.stringify({
      titel: payload.titel,
      body: payload.body ?? '',
      url: payload.url ?? '/',
      type: payload.type ?? 'algemeen',
      id: payload.id ?? null,
    })

    const verlopen: string[] = []
    let gelukt = 0

    await Promise.all(
      abonnementen.map(async (ab) => {
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
