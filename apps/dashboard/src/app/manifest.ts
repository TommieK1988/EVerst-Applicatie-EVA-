import type { MetadataRoute } from 'next'

/**
 * PWA web-app manifest (App Router metadata-route → /manifest.webmanifest).
 * Online-only scaffold; geen offline-caching in deze versie.
 *
 * Icons: echte PNG's met de merkgroene achtergrond. Het losse beeldmerk is WIT
 * (bedoeld voor een donkere ondergrond) en werd daardoor onzichtbaar als
 * app-icoon op een licht startscherm.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EVA — Everts Platform',
    short_name: 'EVA',
    description: 'EVA — het centrale platform van Everts Groep',
    start_url: '/m',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#009439',
    lang: 'nl',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable: de mark staat binnen de veilige zone, dus launchers mogen
      // vrij bijsnijden zonder dat de E wordt aangetast.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
