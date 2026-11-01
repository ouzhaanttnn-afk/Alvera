// Google görünürlüğü: sabit yapılandırılmış veri sayfadaki gerçek bilgilerle tutarlı mı, site haritası doğru mu.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'alvera-seo-'));
process.env.ALPERA_LOCAL_STORAGE = '1';
process.env.ALPERA_DATA_DIR = dir;
delete process.env.VERCEL;

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const ld = () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  expect(blocks).toHaveLength(1);
  return JSON.parse(blocks[0][1]);
};
const sitemap = (handler: any) =>
  new Promise<{ status: number; body: string; headers: Record<string, string> }>((resolve) => {
    const out = { status: 200, body: '', headers: {} as Record<string, string> };
    const res = {
      setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
      status(code: number) { out.status = code; return res; },
      send(body: string) { out.body = body; resolve(out); return res; },
      end() { resolve(out); return res; },
    };
    handler({ method: 'GET' }, res);
  });

let defaults: any;
let updateCatalog: any;
let handler: any;
beforeAll(async () => {
  // @ts-ignore tip bildirimi olmayan düz JavaScript modülleri
  ({ defaults, updateCatalog } = await import('../lib/catalog.js'));
  // @ts-ignore
  handler = (await import('../api/sitemap.js')).default;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Sabit JSON-LD (JavaScript çalışmasa da Google görür)', () => {
  it('işletme türü ve temel bilgiler tam', () => {
    const data = ld();
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('JewelryStore');
    expect(data.name).toBe('Alvera Kuyumculuk');
    expect(data.address).toMatchObject({ '@type': 'PostalAddress', addressLocality: 'Mamak', addressRegion: 'Ankara', addressCountry: 'TR' });
    for (const key of ['url', 'image', 'logo', 'hasMap']) expect(data[key], key).toMatch(/^https:\/\//);
  });

  it('telefon, adres ve Instagram sayfadaki ve yönetim ayarlarındaki bilgilerle aynı', () => {
    const data = ld();
    const phone = html.match(/href="tel:(\+\d+)"/)![1];
    expect(data.telephone.replace(/\D/g, '')).toBe(phone.replace(/\D/g, ''));
    expect(defaults.settings.phone.replace(/\D/g, '').replace(/^0/, '90')).toBe(phone.replace(/\D/g, ''));
    expect(`${data.address.streetAddress}, ${data.address.addressLocality} / ${data.address.addressRegion}`).toBe(defaults.settings.address);
    expect(data.sameAs).toEqual([`https://www.instagram.com/${defaults.settings.instagram}/`]);
    expect(data.hasMap).toBe(defaults.settings.mapsUrl);
    expect(html).toContain(`<link rel="canonical" href="${data.url}/" />`);
    expect(html).toContain(`<meta property="og:url" content="${data.url}/" />`);
  });

  it('doğrulanamayan bilgi içermez: puan, yorum, saat, koordinat, fiyat aralığı yok', () => {
    const text = JSON.stringify(ld());
    for (const forbidden of ['aggregateRating', 'review', 'openingHours', 'geo', 'priceRange', 'postalCode']) expect(text, forbidden).not.toContain(forbidden);
  });
});

describe('/sitemap.xml', () => {
  it('kayıt yokken lastmod uydurulmaz', async () => {
    const r = await sitemap(handler);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/xml');
    expect(r.body).toContain('<loc>https://alvera-ashy.vercel.app</loc>');
    expect(r.body).not.toContain('lastmod');
  });

  it('katalog değiştikten sonra gerçek değişiklik tarihi yazılır', async () => {
    const before = Date.now();
    await updateCatalog('', () => undefined);
    const r = await sitemap(handler);
    const stamp = r.body.match(/<lastmod>([^<]+)<\/lastmod>/)![1];
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(stamp)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(stamp)).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('yalnızca GET kabul edilir', async () => {
    const out: { status: number } = { status: 0 };
    await new Promise<void>((resolve) => {
      const res = { status(code: number) { out.status = code; return res; }, end() { resolve(); return res; } };
      handler({ method: 'POST' }, res);
    });
    expect(out.status).toBe(405);
  });
});

describe('robots.txt', () => {
  it('yönetim alanını kapatır, site haritasını bildirir', () => {
    const robots = readFileSync(join(__dirname, '..', 'robots.txt'), 'utf8');
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toMatch(/^Sitemap: https:\/\/\S+\/sitemap\.xml$/m);
  });
});
