/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@everts/database', '@everts/ui', '@everts/auth', '@everts/config'],
  devIndicators: false,
  // Twee gelijktijdige dev servers (bijv. twee Claude/terminal-sessies) mogen niet
  // dezelfde .next-map delen — dat corrumpeert elkaars build-manifests (random 404's).
  // Zet NEXT_DIST_DIR om een tweede instantie een eigen build-map te geven.
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
