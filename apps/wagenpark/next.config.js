/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@everts/database', '@everts/wagenpark-core'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
      allowedOrigins: ['localhost:3005'],
    },
  },
}

module.exports = nextConfig
