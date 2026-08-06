import type { MetadataRoute } from 'next'

/**
 * PWA web-app manifest (App Router metadata-route → /manifest.webmanifest).
 * Online-only scaffold; geen offline-caching in deze versie.
 *
 * Icons: gerenderd uit /logo-beeldmerk.svg (groene tegel met witte E en punt).
 * Het losse beeldmerk is WIT (bedoeld voor een donkere ondergrond) en zou als
 * los app-icoon onzichtbaar zijn op een licht startscherm — vandaar de tegel.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EVA — Everts Platform',
    short_name: 'EVA',
    description: 'EVA — het centrale platform van Everts Groep',
    start_url: '/m',
    scope: '/',
    display: 'standalone',
    // 'any' (niet 'portrait'): de dossierplanning toont in liggende stand een
    // Gantt-weergave — met een portrait-lock draait de geïnstalleerde PWA niet mee.
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#009439',
    lang: 'nl',
    icons: [
      { src: '/icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable is een ANDER bestand: de achtergrond loopt door tot de rand en
      // de E staat kleiner in het midden (binnen de veilige zone). Hier de
      // gewone tegel opgeven zou betekenen dat Android-launchers dwars door de
      // afgeronde hoeken heen snijden.
      {
        src: '/icon-maskable-512.png?v=2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
