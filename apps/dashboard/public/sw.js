/*
 * EVA service worker — online-only + pushmeldingen.
 *
 * Doel in deze versie: de app installeerbaar maken (PWA vereist een
 * geregistreerde SW met een fetch-handler) en pushmeldingen ontvangen. Er is
 * BEWUST geen offline-cache: navigaties en requests gaan altijd naar het
 * netwerk. Wanneer offline-werken voor de buitendienst wordt opgepakt, is dit
 * het bestand om Workbox / runtime-caching + een form-queue aan toe te voegen.
 */
self.addEventListener('install', () => {
  // Activeer de nieuwe SW direct, zonder te wachten op het sluiten van tabs.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Neem direct controle over open clients.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Network-only passthrough. De handler is nodig voor installability;
  // we voegen (nog) geen caching toe.
  event.respondWith(fetch(event.request))
})

/* ── Pushmeldingen ──────────────────────────────────────────────────────────
 *
 * De server stuurt JSON: { titel, body, url, type, id }. Zie
 * src/lib/notificaties/push.ts. Deze handler draait ook als EVA helemaal dicht
 * staat — dat is het hele punt van push.
 */

const TYPE_ICOON = {
  formulier_taak: '📋',
  formulier_ingediend: '✅',
  debiteur: '💶',
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Payload onleesbaar (of leeg, bijv. bij een testpush vanuit de browser):
    // liever een kale melding dan helemaal geen melding.
    data = {}
  }

  const icoon = TYPE_ICOON[data.type] || '🔔'
  const titel = data.titel ? `${icoon} ${data.titel}` : 'EVA'
  const url = data.url || '/'

  // Tellertje op het app-icoon bijwerken. Moet hier gebeuren: staat EVA dicht,
  // dan is dit het enige moment waarop de teller verandert tot de gebruiker de
  // app weer opent. Het aantal komt mee in de melding (zie lib/notificaties/push.ts);
  // de service worker kan er zelf niet bij.
  if (typeof data.ongelezen === 'number' && self.navigator.setAppBadge) {
    if (data.ongelezen > 0) self.navigator.setAppBadge(data.ongelezen).catch(() => {})
    else if (self.navigator.clearAppBadge) self.navigator.clearAppBadge().catch(() => {})
  }

  event.waitUntil(
    self.registration.showNotification(titel, {
      body: data.body || '',
      icon: '/icon-192.png?v=2',
      badge: '/badge-96.png',
      // Eén melding per notificatie-rij: een tweede push met dezelfde id
      // vervangt de eerste in plaats van de lijst te verdubbelen.
      tag: data.id ? `eva-${data.id}` : undefined,
      data: { url },
      // Op Android blijft de melding staan tot de gebruiker hem wegveegt of
      // aantikt; anders verdwijnt hij na een paar seconden ongemerkt.
      requireInteraction: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const doel = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const clientsLijst = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Staat EVA al open? Dan dat venster naar voren halen en daarbinnen
      // navigeren — een tweede tab/venster openen is op een telefoon rommelig.
      for (const client of clientsLijst) {
        if (client.url.includes(self.location.origin)) {
          await client.focus()
          if ('navigate' in client) {
            try { await client.navigate(doel) } catch { /* focus is genoeg */ }
          }
          return
        }
      }

      await self.clients.openWindow(doel)
    })(),
  )
})

/*
 * De pushdienst kan een abonnement uit zichzelf vernieuwen (sleutelrotatie).
 * Zonder deze handler blijft EVA naar het oude endpoint sturen en komt er niets
 * meer aan — zonder dat iemand het merkt.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oud = event.oldSubscription || (await self.registration.pushManager.getSubscription())
        const antwoord = await fetch('/api/push/sleutel')
        const { beschikbaar, publicKey } = await antwoord.json()
        if (!beschikbaar) return

        const nieuw =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: publicKey,
          }))

        if (oud && oud.endpoint !== nieuw.endpoint) {
          await fetch('/api/push/afmelden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: oud.endpoint }),
          })
        }
        await fetch('/api/push/aanmelden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nieuw.toJSON()),
        })
      } catch {
        // Niets te doen: bij de volgende keer dat de gebruiker EVA opent,
        // meldt de client zich alsnog opnieuw aan (zie lib/push/client.ts).
      }
    })(),
  )
})
