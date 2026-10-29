import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['@electric-sql/pglite', '@neondatabase/serverless'],
  outputFileTracingExcludes: {
    '**': ['./.local-test/**/*'],
  },
  async headers() {
    return [
      {
        source: '/login/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
        ],
      },
    ]
  },
  outputFileTracingIncludes: {
    '/api/billing/**': [
      './assets/fonts/NotoSansJP-Regular.ttf',
      './assets/brand/acoru-logo.png',
    ],
    '/api/cron/billing': [
      './assets/fonts/NotoSansJP-Regular.ttf',
      './assets/brand/acoru-logo.png',
    ],
  },
}

export default nextConfig
