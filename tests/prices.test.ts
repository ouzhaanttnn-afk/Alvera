// Altın fiyat servisi: kaynak biçimleri, geçersiz veri reddi ve "son başarılı fiyat" yedeği.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'alvera-prices-'));
process.env.ALPERA_LOCAL_STORAGE = '1';
process.env.ALPERA_DATA_DIR = dir;
delete process.env.VERCEL;

type Res = { status: number; body: any; headers: Record<string, string> };
let handler: (req: any, res: any) => Promise<any>;
let parsePrice: (v: unknown) => number | null;

const row = (Kod: string, Alis: string, Satis: string, GuncellenmeZamani = '01.11.2026 10:58:11') => ({ Kod, Alis, Satis, Aciklama: Kod, GuncellenmeZamani });
const goldFeed = (over: Record<string, [string, string]> = {}) => {
  const base: Record<string, [string, string]> = {
    PGA: ['6.206', '6.350'], PC: ['9.972', '10.520'], PY: ['19.926', '21.035'], PA: ['40.978', '44.255'], PB: ['5.683', '6.105'], P18: ['4.298', '5.020'], P14: ['3.522', '3.995'], ...over,
  };
  return [...Object.entries(base).map(([k, [a, s]]) => row(k, a, s)), row('AG_T', '73,00', '84,00')];
};

function call(): Promise<Res> {
  return new Promise((resolve) => {
    const out: Res = { status: 200, body: null, headers: {} };
    const res = {
      setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
      status(code: number) { out.status = code; return res; },
      json(data: unknown) { out.body = data; resolve(out); return res; },
    };
    handler({ method: 'GET' }, res);
  });
}
const upstream = (body: unknown, ok = true, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, json: async () => body })));

beforeAll(async () => {
  // @ts-ignore tip bildirimi olmayan düz JavaScript modülü
  const mod = await import('../api/prices.js');
  handler = mod.default;
  parsePrice = mod.parsePrice;
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Fiyat biçimleri', () => {
  it('kuruşsuz ve kuruşlu biçimleri okur, bozuk biçimleri reddeder', () => {
    expect(parsePrice('6.206')).toBe(6206);
    expect(parsePrice('3.100.023')).toBe(3100023);
    expect(parsePrice('6.475,28')).toBe(6475.28);
    expect(parsePrice('73,00')).toBe(73);
    for (const bad of ['', 'abc', '6,206.50', '6206', '1.23', '0', '0,00', null, undefined, '12.34.5', '-5,00']) expect(parsePrice(bad), String(bad)).toBeNull();
  });
});

describe('/api/prices', () => {
  it('Eylül öncesi (kuruşlu) ve yeni (kuruşsuz) kaynak biçimi ikisi de kabul edilir', async () => {
    upstream(goldFeed());
    const a = await call();
    expect(a.status).toBe(200);
    expect(a.body.prices.slice(0, 5).map((p: any) => p.code)).toEqual(['PGA', 'PC', 'PY', 'PA', 'PB']);
    expect(a.body.prices.map((p: any) => p.code)).toEqual(expect.arrayContaining(['P18', 'P14']));
    expect(a.body.source_updated_at).toBe('2026-11-01T10:58:11+03:00');
    expect(a.body.stale).toBeUndefined();
    upstream(goldFeed({ PGA: ['6.475,28', '6.630,00'] }));
    expect((await call()).body.prices[0]).toMatchObject({ buy: '6.475,28', sell: '6.630,00' });
  });

  it('geçersiz veya eksik fiyat 503 verir; fiyat uydurulmaz', async () => {
    // yedek henüz yok: önce temiz bir veri klasörü
    rmSync(join(dir, 'prices-last.json'), { force: true });
    upstream(goldFeed({ PGA: ['yaklaşık 6200', '6.350'] }));
    expect((await call()).status).toBe(503);
    upstream(goldFeed().filter((e) => e.Kod !== 'PC'));
    expect((await call()).status).toBe(503);
    upstream({ hata: true });
    expect((await call()).status).toBe(503);
    upstream({}, false, 500);
    expect((await call()).status).toBe(503);
  });

  it('14/18 ayar satırları yoksa yalnızca hesaplayıcı satırları eksik kalır, tablo çalışır', async () => {
    upstream(goldFeed().filter((e) => !['P18', 'P14'].includes(e.Kod)));
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.prices.map((p: any) => p.code)).toEqual(['PGA', 'PC', 'PY', 'PA', 'PB']);
  });

  it('kaynak çökerse son başarılı fiyatlar kendi saatiyle ve eski işaretiyle verilir', async () => {
    upstream(goldFeed());
    expect((await call()).status).toBe(200); // yedeği yazar
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ağ hatası'); }));
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
    expect(r.body.source_updated_at).toBe('2026-11-01T10:58:11+03:00');
    expect(r.body.prices[0]).toMatchObject({ code: 'PGA', buy: '6.206', sell: '6.350' });
    expect(r.body.snapshot_saved_at).toMatch(/^\d{4}-/);
    expect(r.headers['cache-control']).toContain('s-maxage=60');
  });

  it('72 saatten eski yedek gösterilmez', async () => {
    upstream(goldFeed().map((e) => ({ ...e, GuncellenmeZamani: '01.01.2026 10:00:00' })));
    expect((await call()).status).toBe(200); // eski saatli yedek yazılır
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ağ hatası'); }));
    expect((await call()).status).toBe(503);
  });

  it('yalnızca GET kabul edilir', async () => {
    const out: Res = { status: 200, body: null, headers: {} };
    await new Promise<void>((resolve) => {
      const res = { setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; }, status(c: number) { out.status = c; return res; }, json(d: unknown) { out.body = d; resolve(); return res; } };
      handler({ method: 'POST' }, res);
    });
    expect(out.status).toBe(405);
  });
});
