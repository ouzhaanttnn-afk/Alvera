// Toplu ürün ekleme ve hızlı yayımlama (api/manage.js) — geçici yerel veri klasörü, sentetik veri.
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'alvera-bulk-'));
process.env.ALPERA_LOCAL_STORAGE = '1';
process.env.ALPERA_DATA_DIR = dir;
delete process.env.VERCEL;
const PASSWORD = 'Sentetik-Test-Parolasi-14';
const HOST = '127.0.0.1:3000';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]).toString('base64');

type Res = { status: number; body: any; headers: Record<string, string> };
let manage: (req: any, res: any) => Promise<any>;
let publicCatalog: () => Promise<any>;
let cookie = '';
let csrf = '';

function call(action: string, opts: { method?: string; body?: unknown; auth?: boolean; origin?: string; csrf?: string | null } = {}): Promise<Res> {
  const method = opts.method || 'POST';
  const headers: Record<string, string> = { host: HOST };
  if (method === 'POST') headers.origin = opts.origin ?? `http://${HOST}`;
  if (opts.auth !== false && cookie) headers.cookie = cookie;
  if (opts.csrf !== null && opts.auth !== false && csrf) headers['x-csrf-token'] = opts.csrf ?? csrf;
  return new Promise((resolve) => {
    const out: Res = { status: 200, body: null, headers: {} };
    const res = {
      setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
      status(code: number) { out.status = code; return res; },
      json(data: unknown) { out.body = data; resolve(out); return res; },
    };
    manage({ method, query: { action }, body: opts.body ?? {}, headers, socket: { remoteAddress: '127.0.0.1' } }, res);
  });
}

async function revision() {
  return (await call('catalog', { method: 'GET' })).body.revision as string;
}
async function photo(name = 'sentetik.webp') {
  const r = await call('upload', { body: { data: JPEG, name, width: 800, height: 600 } });
  expect(r.status).toBe(200);
  return r.body.photo.id as string;
}
const bulk = async (products: unknown[], rev?: string) => call('bulk', { body: { revision: rev ?? (await revision()), products } });

beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const salt = randomBytes(24).toString('hex');
  writeFileSync(join(dir, 'security.json'), JSON.stringify({ credential: { username: 'alvera', salt, hash: scryptSync(PASSWORD, salt, 64).toString('hex') }, sessions: [], attempts: {}, createdAt: new Date().toISOString() }));
  // Bu iki modül tip bildirimi olmayan düz JavaScript; yalnızca test içinde kullanılıyor.
  // @ts-ignore
  manage = (await import('../api/manage.js')).default;
  // @ts-ignore
  const catalogModule = await import('../lib/catalog.js');
  publicCatalog = async () => catalogModule.publicCatalog(await catalogModule.catalog());
  const login = await call('login', { body: { username: 'alvera', password: PASSWORD }, auth: false });
  expect(login.status).toBe(200);
  csrf = login.body.csrf;
  cookie = login.headers['set-cookie'].split(';')[0];
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Toplu ürün ekleme güvenliği', () => {
  it('oturum, CSRF anahtarı ve istek kaynağı olmadan reddedilir', async () => {
    const body = { revision: await revision(), products: [{ name: 'X', category: 'yuzuk', image: await photo() }] };
    expect((await call('bulk', { body, auth: false })).status).toBe(401);
    expect((await call('bulk', { body, csrf: null })).status).toBe(403);
    expect((await call('bulk', { body, csrf: 'yanlis' })).status).toBe(403);
    expect((await call('bulk', { body, origin: 'https://saldirgan.example' })).status).toBe(403);
    expect((await call('visibility', { body: { revision: body.revision, id: 'x', visible: true }, auth: false })).status).toBe(401);
    expect((await publicCatalog()).products).toEqual([]);
  });
});

describe('Toplu ürün ekleme', () => {
  it('her fotoğraf ayrı taslak ürün olur; yayımlanmaz ve sıra korunur', async () => {
    const [a, b, c] = [await photo('a.webp'), await photo('b.webp'), await photo('c.webp')];
    const r = await bulk([
      { name: 'Altın bilezik', category: 'bilezik', image: a },
      { name: '  Solitaire yüzük  ', category: 'yuzuk', image: b },
      { name: 'Yüzük 3', category: 'yuzuk', image: c },
    ]);
    expect(r.status).toBe(200);
    const made = r.body.products.slice(-3);
    expect(made.map((p: any) => p.name)).toEqual(['Altın bilezik', 'Solitaire yüzük', 'Yüzük 3']);
    expect(made.map((p: any) => p.images)).toEqual([[a], [b], [c]]);
    expect(made.every((p: any) => p.visible === false && p.archived === false)).toBe(true);
    expect(made.map((p: any) => p.order)).toEqual([0, 1, 2]);
    expect((await publicCatalog()).products).toEqual([]);
  });

  it('geçersiz veri reddedilir ve hiçbir ürün yarım kalmaz (hep ya da hiç)', async () => {
    const image = await photo();
    const before = (await call('catalog', { method: 'GET' })).body;
    const rev = before.revision;
    const cases: [string, unknown[]][] = [
      ['boş liste', []],
      ['21 ürün', Array.from({ length: 21 }, (_, i) => ({ name: `Ürün ${i}`, category: 'kupe', image }))],
      ['bilinmeyen kategori', [{ name: 'A', category: 'yok', image }]],
      ['boş ad', [{ name: '   ', category: 'kupe', image }]],
      ['olmayan fotoğraf', [{ name: 'A', category: 'kupe', image: '00000000-0000-4000-8000-000000000000' }]],
      ['fotoğraf alanı yok', [{ name: 'A', category: 'kupe' }]],
      ['ikinci ürün hatalı', [{ name: 'Geçerli', category: 'kupe', image }, { name: 'Hatalı', category: 'yok', image }]],
    ];
    for (const [label, products] of cases) {
      const r = await bulk(products, rev);
      expect(r.status, label).toBe(400);
    }
    const after = (await call('catalog', { method: 'GET' })).body;
    expect(after.products).toHaveLength(before.products.length);
    expect(after.revision).toBe(rev);
  });

  it('güncel olmayan revizyon (başka sekme) kaydı ezmez', async () => {
    const image = await photo();
    const stale = await revision();
    expect((await bulk([{ name: 'Önce', category: 'kolye', image }], stale)).status).toBe(200);
    const late = await bulk([{ name: 'Sonra', category: 'kolye', image }], stale);
    expect(late.status).toBe(409);
    expect((await call('catalog', { method: 'GET' })).body.products.some((p: any) => p.name === 'Sonra')).toBe(false);
  });
});

describe('Hızlı yayımlama', () => {
  it('yalnızca yayımlanan ürün herkese açık kataloğa girer; geri alınabilir', async () => {
    const catalog = (await call('catalog', { method: 'GET' })).body;
    const product = catalog.products.find((p: any) => p.name === 'Solitaire yüzük');
    const on = await call('visibility', { body: { revision: catalog.revision, id: product.id, visible: true } });
    expect(on.status).toBe(200);
    expect((await publicCatalog()).products.map((p: any) => p.name)).toEqual(['Solitaire yüzük']);
    const off = await call('visibility', { body: { revision: on.body.revision, id: product.id, visible: false } });
    expect(off.status).toBe(200);
    expect((await publicCatalog()).products).toEqual([]);
  });

  it('fotoğrafsız ürün yayımlanamaz, arşivdeki ürün bulunamaz', async () => {
    const rev = await revision();
    const none = await call('save', { body: { revision: rev, product: { name: 'Fotoğrafsız', category: 'hediye', images: [], visible: false } } });
    expect(none.status).toBe(200);
    const empty = none.body.products.find((p: any) => p.name === 'Fotoğrafsız');
    const refused = await call('visibility', { body: { revision: none.body.revision, id: empty.id, visible: true } });
    expect(refused.status).toBe(400);
    const archived = await call('archive', { body: { revision: await revision(), id: empty.id } });
    expect(archived.status).toBe(200);
    expect((await call('visibility', { body: { revision: archived.body.revision, id: empty.id, visible: true } })).status).toBe(404);
  });
});

// Katalog dolduğu için bu test dosyanın en sonunda çalışır.
describe('Ürün sınırı', () => {
  it('300 ürün sınırı aşılamaz', async () => {
    const image = await photo();
    let count = (await call('catalog', { method: 'GET' })).body.products.length;
    while (count + 20 <= 300) {
      expect((await bulk(Array.from({ length: 20 }, (_, i) => ({ name: `Dolgu ${count + i}`, category: 'ozel', image })))).status).toBe(200);
      count += 20;
    }
    const rest = 300 - count;
    if (rest > 0) expect((await bulk(Array.from({ length: rest }, (_, i) => ({ name: `Son ${i}`, category: 'ozel', image })))).status).toBe(200);
    const over = await bulk([{ name: 'Fazla', category: 'ozel', image }]);
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/300/);
  });
});
