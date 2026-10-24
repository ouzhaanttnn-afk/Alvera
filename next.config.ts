import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingExcludes: {
    '*': ['./.local/**', './test-results/**', './playwright-report/**', './tmp/**', './.env*'],
  },
  serverExternalPackages: ['node:sqlite', 'sharp'],
  outputFileTracingIncludes: { '/api/masak/admin/[...path]': ['./assets/fonts/*', './public/brand/*'] },
  async rewrites() { return { beforeFiles: [{ source: '/', destination: '/index.html' }, { source: '/admin', destination: '/admin.html' }, { source: '/sitemap.xml', destination: '/api/sitemap' }], afterFiles: [], fallback: [] }; },
  async headers() {
    return [
      {
        source: '/masak-form/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"} https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
          },
        ],
      },
    ];
  },
};
export default config;
