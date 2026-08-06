/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@everts/database', '@everts/ui', '@everts/auth', '@everts/config'],
  // qrcode heeft een `browser`-veld dat zijn entry naar een canvas-gebaseerde browserbuild
  // remapt. Zou webpack die bundelen, dan draait server-side de browserbuild → toDataURL
  // gooit "You need to specify a canvas element" en de QR-code blijft leeg. Extern houden
  // dwingt de Node-build af (pngjs), die server-side wél werkt.
  serverExternalPackages: ['qrcode'],
  devIndicators: false,
  // Twee gelijktijdige dev servers (bijv. twee Claude/terminal-sessies) mogen niet
  // dezelfde .next-map delen — dat corrumpeert elkaars build-manifests (random 404's).
  // Zet NEXT_DIST_DIR om een tweede instantie een eigen build-map te geven.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      // Foto's gaan als FormData door een server-action. De standaardlimiet is 1 MB, en daar
      // past geen enkele camerafoto in — de upload faalde met een onverklaarbare fout.
      // Vangnet: de foto wordt op de telefoon al verkleind (lib/mobiel/verkleinFoto.ts), dus in
      // de praktijk gaat er ~300 kB overheen. Deze ruimte is voor de gevallen waarin dat
      // verkleinen niet lukt (HEIC zonder decoder, onbekend formaat).
      bodySizeLimit: '8mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            // Expliciet toestaan wat EVA Mobiel op locatie nodig heeft. Zonder deze header
            // geldt de browserstandaard (`self`) en gaat het meestal ook goed, maar een
            // tussenliggende proxy of een strenger wordende browserstandaard kan de
            // toestemming dan zonder melding negeren — en dan lijkt het alsof een verleende
            // toestemming "niet blijft hangen". Alleen `self`: EVA's eigen pagina's mogen
            // erom vragen, ingesloten iframes (YouTube in de toolbox) niet.
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(self)',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
