/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.mapillary.com',
      },
      {
        protocol: 'https',
        hostname: 'service.pdok.nl',
      },
      {
        protocol: 'https',
        hostname: 'api.pdok.nl',
      },
    ],
  },
}

module.exports = nextConfig
