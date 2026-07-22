/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@everts/database', '@everts/ui', '@everts/auth', '@everts/config'],
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
}

module.exports = nextConfig
