import type { MetadataRoute } from 'next'

/**
 * PWA web-app manifest (App Router metadata-route → /manifest.webmanifest).
 * Online-only scaffold; geen offline-caching in deze versie.
 *
 * LET OP: de icons verwijzen voorlopig naar het bestaande SVG-beeldmerk.
 * Voor een nette install-ervaring (en de Lighthouse "installable"-audit)
 * zijn echte raster-icons gewenst: 192×192 en 512×512 PNG + een maskable
 * variant onder /icons/. Vervang de entries hieronder zodra die er zijn.
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
      {
        src: '/logo-beeldmerk.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/logo-beeldmerk.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
