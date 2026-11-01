import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingExcludes: {
    '*': ['./.local/**', './test-results/**', './playwright-report/**', './tmp/**', './.env*'],
  },
  serverExternalPackages: ['node:sqlite', 'sharp', '@electric-sql/pglite', 'postgres'],
  outputFileTracingIncludes: {
    '/api/masak/admin/[...path]': ['./assets/fonts/*', './public/brand/*'],
    '/api/masak-raporu/rapor': ['./assets/fonts/*', './public/brand/*'],
    '/api/masak-raporu/denetim': ['./assets/fonts/*', './public/brand/*'],
  },
  async rewrites() { return { beforeFiles: [{ source: '/', destination: '/index.html' }, { source: '/admin', destination: '/admin.html' }, { source: '/sitemap.xml', destination: '/api/sitemap' }], afterFiles: [], fallback: [] }; },
  async headers() {
    const raporHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      // same-origin: dış sitelere referrer gitmez; form POST'larında Origin başlığı korunur (CSRF kontrolü için).
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      { key: 'Cache-Control', value: 'no-store, private, max-age=0' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      {
        key: 'Content-Security-Policy',
        // Tesseract.js OCR motoru ve dil verisi jsDelivr'dan indirilir; görüntü tarayıcıda işlenir, dışarı gönderilmez.
        value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"} https://cdn.jsdelivr.net; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://cdn.jsdelivr.net https://*.supabase.co; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
      },
    ];
    return [
      { source: '/masak-raporu', headers: raporHeaders },
      { source: '/masak-raporu/:path*', headers: raporHeaders },
      { source: '/api/masak-raporu/:path*', headers: raporHeaders.filter((h) => h.key !== 'Content-Security-Policy') },
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
