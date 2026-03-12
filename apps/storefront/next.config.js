/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a standalone Node.js server for Docker deployment
  output: 'standalone',

  // Multi-tenant subdomain routing
  // The middleware handles tenant resolution via the Host header
  experimental: {
    serverComponentsExternalPackages: ['pg'],
  },

  images: {
    // Allow images from DigitalOcean Spaces and tenant custom domains
    remotePatterns: [
      { protocol: 'https', hostname: '**.digitaloceanspaces.com' },
      { protocol: 'https', hostname: '**.gadnuc.com' },
    ],
    // WordPress-style thumbnail sizes for product images
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes:  [128, 256, 384, 512, 640],
    formats:     ['image/webp'],
    // Keep served images reasonable — no giant originals
    minimumCacheTTL: 60 * 60 * 24, // 24h CDN cache
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
