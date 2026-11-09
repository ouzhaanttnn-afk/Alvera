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

// Beslemenin saati her zaman "şimdiden 1 saat önce" (İstanbul saati): 72 saatlik yedek sınırı testi sabit bir takvim gününe bağlı kalmasın.
const istanbul = new Date(Date.now() + 3 * 3600 * 1000 - 3600 * 1000).toISOString();
const STAMP = {
  display: `${istanbul.slice(8, 10)}.${istanbul.slice(5, 7)}.${istanbul.slice(0, 4)} ${istanbul.slice(11, 19)}`,
  iso: `${istanbul.slice(0, 19)}+03:00`,
};
const row = (Kod: string, Alis: string, Satis: string, GuncellenmeZamani = STAMP.display) => ({ Kod, Alis, Satis, Aciklama: Kod, GuncellenmeZamani });
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
type Ozan = 'down' | { gold?: unknown; sarrafiye?: unknown; goldStatus?: number };
// Altınkaynak (GET) ve ikinci kaynak (POST) adreslerine göre ayrı yanıt verir. Varsayılan: ikinci kaynak çalışmıyor.
const upstream = (body: unknown, ozan: Ozan = 'down', ok = true, status = 200) => {
  const fn = vi.fn(async (url: unknown, init?: { method?: string; body?: unknown }) => {
    const target = String(url);
    if (target.includes('altinkaynak')) return { ok, status, json: async () => body };
    if (ozan === 'down') return { ok: false, status: 500, json: async () => ({}) };
    if (target.includes('goldpagedataredis')) return { ok: (ozan.goldStatus ?? 200) < 400, status: ozan.goldStatus ?? 200, json: async () => ozan.gold };
    if (target.includes('onlinesarrafiyetlpagedataredis')) return { ok: true, status: 200, json: async () => ozan.sarrafiye };
    throw new Error('beklenmeyen adres: ' + target + ' ' + init?.method);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};
const ozanGold = (alis = '6632.38', satis = '6662.31') => ({ data: { USDTRY: { code: 'USD /TL', alis: '50.180', satis: '50.290' }, ALTIN: { code: 'HAS ALTIN /TL', alis, satis }, '995HAS': { code: '995 HAS', alis: '6599.22', satis: '6628.99' } } });
const ozanSarrafiye = (over: Record<string, [string, string]> = {}) => {
  const base: Record<string, [string, string]> = { 'Y. Çeyrek': ['10814.62', '10903.98'], 'Y. Yarım': ['21637.87', '21795.29'], 'Y. Ata Lira': ['43972.50', '44588.04'], 'E. Çeyrek': ['10711.67', '10807.91'], ...over };
  return { data: Object.fromEntries(Object.entries(base).map(([code, [alis, satis]], i) => [`stl${i + 1}`, { code, alis, satis }])) };
};
// Altınkaynak'ın o günkü gerçek değerlerine yakın besleme: ikinci kaynakla çapraz kontrol bunlara bakar.
const market = () => goldFeed({ PGA: ['6.606', '6.750'], PC: ['10.677', '11.195'], PY: ['21.262', '22.390'], PA: ['43.678', '47.110'] });
const find = (r: Res, code: string) => r.body.prices.find((p: any) => p.code === code);

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
    expect(a.body.source_updated_at).toBe(STAMP.iso);
    expect(a.body.stale).toBeUndefined();
    expect(a.body).not.toHaveProperty('source');
    expect(a.body).not.toHaveProperty('source_url');
    expect(JSON.stringify(a.body)).not.toMatch(/altınkaynak|ozan/i);
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
    upstream({}, 'down', false, 500);
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
    expect(r.body.source_updated_at).toBe(STAMP.iso);
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

describe('İkinci kaynak: has altın ve sarrafiye', () => {
  it('24 ayar gram: alış has alıştan, satış has satış × 1,003; çeyrek/yarım/ata doğrudan; kalanlar ilk kaynaktan', async () => {
    upstream(market(), { gold: ozanGold(), sarrafiye: ozanSarrafiye() });
    const r = await call();
    expect(r.status).toBe(200);
    expect(find(r, 'PGA')).toMatchObject({ buy: '6.632,38', sell: '6.682,30' }); // 6662,31 × 1,003 = 6682,29693 → 6682,30
    expect(find(r, 'PC')).toMatchObject({ buy: '10.814,62', sell: '10.903,98' });
    expect(find(r, 'PY')).toMatchObject({ buy: '21.637,87', sell: '21.795,29' });
    expect(find(r, 'PA')).toMatchObject({ buy: '43.972,50', sell: '44.588,04' });
    expect(find(r, 'PB')).toMatchObject({ buy: '5.683', sell: '6.105' }); // 22 ayar ilk kaynakta kalır
    expect(find(r, 'P18')).toMatchObject({ buy: '4.298', sell: '5.020' });
    expect(r.body.prices.map((p: any) => p.code)).toEqual(['PGA', 'PC', 'PY', 'PA', 'PB', 'P18', 'P14']);
    expect(r.body).not.toHaveProperty('source');
    expect(JSON.stringify(r.body)).not.toMatch(/altınkaynak|ozan/i);
  });

  it('kuruş yuvarlaması tam sayıyla yapılır (yarım kuruş yukarı)', async () => {
    upstream(goldFeed({ PGA: ['4,90', '5,10'] }), { gold: ozanGold('4.90', '5.00'), sarrafiye: ozanSarrafiye() });
    expect(find(await call(), 'PGA').sell).toBe('5,02'); // 500 kuruş × 1,003 = 501,5 → 502
    upstream(goldFeed({ PGA: ['99', '101'] }), { gold: ozanGold('99.50', '100.15'), sarrafiye: ozanSarrafiye() });
    expect(find(await call(), 'PGA').sell).toBe('100,45'); // 100,15 × 1,003 = 100,45045
  });

  it('ikinci kaynak POST ile ve yalnızca iki adrese istek atar', async () => {
    const fn = upstream(market(), { gold: ozanGold(), sarrafiye: ozanSarrafiye() });
    await call();
    const posts = fn.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts.map(([url]) => String(url)).sort()).toEqual(['https://ozandoviz.com/goldpagedataredis.php', 'https://ozandoviz.com/onlinesarrafiyetlpagedataredis.php']);
    expect(posts.every(([, init]) => String(init?.body) === 'select=true')).toBe(true);
    expect(fn.mock.calls).toHaveLength(3);
  });

  it('ikinci kaynak çökerse ya da bozuk gelirse ilk kaynağın değerleri aynen gösterilir', async () => {
    const cases: [string, Ozan][] = [
      ['HTTP hatası', 'down'],
      ['has satırı yok', { gold: { data: {} }, sarrafiye: { data: {} } }],
      ['bozuk sayı', { gold: ozanGold('yaklaşık 6600', '6.662,31'), sarrafiye: ozanSarrafiye({ 'Y. Çeyrek': ['-5', 'abc'] }) }],
      ['alış satıştan büyük', { gold: ozanGold('6700.00', '6600.00'), sarrafiye: ozanSarrafiye({ 'Y. Çeyrek': ['11000.00', '10000.00'] }) }],
      ['beklenmeyen biçim', { gold: 'html döndü', sarrafiye: null }],
    ];
    for (const [label, ozan] of cases) {
      upstream(market(), ozan);
      const r = await call();
      expect(r.status, label).toBe(200);
      expect(find(r, 'PGA'), label).toMatchObject({ buy: '6.606', sell: '6.750' });
      expect(find(r, 'PC'), label).toMatchObject({ buy: '10.677', sell: '11.195' });
    }
  });

  it('ilk kaynakla uyuşmayan (aşırı sapan) değer kullanılmaz; diğer kalemler etkilenmez', async () => {
    upstream(market(), { gold: ozanGold('9999.00', '9999.50'), sarrafiye: ozanSarrafiye() });
    let r = await call();
    expect(find(r, 'PGA')).toMatchObject({ buy: '6.606', sell: '6.750' }); // has %50 sapıyor → ilk kaynak
    expect(find(r, 'PC')).toMatchObject({ buy: '10.814,62' });              // sarrafiye geçerli → ikinci kaynak
    upstream(market(), { gold: ozanGold(), sarrafiye: ozanSarrafiye({ 'Y. Çeyrek': ['1.00', '1.10'] }) });
    r = await call();
    expect(find(r, 'PC')).toMatchObject({ buy: '10.677', sell: '11.195' }); // çeyrek sapıyor → ilk kaynak
    expect(find(r, 'PGA')).toMatchObject({ buy: '6.632,38', sell: '6.682,30' });
  });

  it('PRICES_OZAN=off ikinci kaynağı tamamen kapatır (istek bile atılmaz)', async () => {
    vi.stubEnv('PRICES_OZAN', 'off');
    const fn = upstream(market(), { gold: ozanGold(), sarrafiye: ozanSarrafiye() });
    const r = await call();
    expect(find(r, 'PGA')).toMatchObject({ buy: '6.606', sell: '6.750' });
    expect(fn.mock.calls).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it('kaynaklar çökünce son başarılı (ikinci kaynaklı) fiyatlar eski işaretiyle verilir', async () => {
    upstream(market(), { gold: ozanGold(), sarrafiye: ozanSarrafiye() });
    expect((await call()).status).toBe(200); // yedeği yazar
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ağ hatası'); }));
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
    expect(find(r, 'PGA')).toMatchObject({ buy: '6.632,38', sell: '6.682,30' });
    expect(r.body).not.toHaveProperty('source');
  });
});
