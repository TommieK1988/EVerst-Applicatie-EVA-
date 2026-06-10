/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@everts/database', '@everts/ui', '@everts/auth', '@everts/config'],
  devIndicators: false,
}

module.exports = nextConfig
