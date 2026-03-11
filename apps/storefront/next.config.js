/** @type {import('next').NextConfig} */
const nextConfig = {
  // Multi-tenant subdomain routing
  // The middleware handles tenant resolution via the Host header
  experimental: {
    serverComponentsExternalPackages: ['pg'],
  },

  images: {
    // Allow images from DigitalOcean Spaces and tenant custom domains
    remotePatterns: [
      { protocol: 'https', hostname: '**.digitaloceanspaces.com' },
      { protocol: 'https', hostname: '**.gadnuc.io' },
    ],
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
