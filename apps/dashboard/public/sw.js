/*
 * EVA service worker — online-only scaffold.
 *
 * Doel in deze versie: de app installeerbaar maken (PWA vereist een
 * geregistreerde SW met een fetch-handler). Er is BEWUST geen offline-cache:
 * navigaties en requests gaan altijd naar het netwerk. Wanneer offline-werken
 * voor de buitendienst wordt opgepakt, is dit het bestand om Workbox /
 * runtime-caching + een form-queue aan toe te voegen.
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
