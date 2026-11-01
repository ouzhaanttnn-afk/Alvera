// Çerezsiz sayaç: yalnızca günlük toplamlar tutulur; kişiye ait hiçbir bilgi saklanmaz.
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'alvera-stats-'));
process.env.ALPERA_LOCAL_STORAGE = '1';
process.env.ALPERA_DATA_DIR = dir;
delete process.env.VERCEL;
const PASSWORD = 'Sentetik-Test-Parolasi-14';
const HOST = '127.0.0.1:3000';
const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const IP = '203.0.113.77';

type Res = { status: number; body: any; headers: Record<string, string> };
let lib: any;
let hit: (req: any, res: any) => Promise<any>;
let manage: (req: any, res: any) => Promise<any>;

function run(handler: (req: any, res: any) => Promise<any>, req: any): Promise<Res> {
  return new Promise((resolve) => {
    const out: Res = { status: 200, body: null, headers: {} };
    const res = {
      setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
      status(code: number) { out.status = code; return res; },
      json(data: unknown) { out.body = data; resolve(out); return res; },
      end() { resolve(out); return res; },
    };
    handler({ socket: { remoteAddress: IP }, ...req }, res);
  });
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  run(hit, { method: 'POST', body, headers: { host: HOST, origin: `http://${HOST}`, 'user-agent': BROWSER, ...headers } });
const stored = () => JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf8'));

beforeAll(async () => {
  mkdirSync(dir, { recursive: true });
  const salt = randomBytes(24).toString('hex');
  writeFileSync(join(dir, 'security.json'), JSON.stringify({ credential: { username: 'alvera', salt, hash: scryptSync(PASSWORD, salt, 64).toString('hex') }, sessions: [], attempts: {}, createdAt: new Date().toISOString() }));
  // @ts-ignore tip bildirimi olmayan düz JavaScript modülleri
  lib = await import('../lib/stats.js');
  // @ts-ignore
  hit = (await import('../api/hit.js')).default;
  // @ts-ignore
  manage = (await import('../api/manage.js')).default;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Sayaç mantığı', () => {
  it('gün sınırı İstanbul saatine göre belirlenir', () => {
    expect(lib.istanbulDay(new Date('2026-11-01T20:59:59Z'))).toBe('2026-11-01');
    expect(lib.istanbulDay(new Date('2026-11-01T21:00:00Z'))).toBe('2026-11-02'); // 00:00 İstanbul
  });

  it('bilinmeyen olay sayılmaz ve belgeye dokunmaz', () => {
    const doc: any = {};
    for (const bad of ['', 'pageview', 'VIEW', '__proto__', 'constructor', 'view ', null, undefined, 5]) expect(lib.record(doc, bad), String(bad)).toBe(false);
    expect(doc).toEqual({});
  });

  it('olayları günlük toplar; belgede yalnızca sayı ve olay adı bulunur', () => {
    const doc: any = {};
    const now = new Date('2026-11-01T10:00:00Z');
    for (let i = 0; i < 3; i++) lib.record(doc, 'view', now);
    lib.record(doc, 'whatsapp', now);
    expect(doc).toEqual({ schema: 1, days: { '2026-11-01': { view: 3, whatsapp: 1 } } });
  });

  it('günlük üst sınır aşılmaz; bozuk kayıtlar sıfır sayılır', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const doc: any = { days: { '2026-11-01': { view: lib.DAY_CAP, call: -4, whatsapp: 'çok', directions: 1.5 } } };
    lib.record(doc, 'view', now);
    expect(doc.days['2026-11-01'].view).toBe(lib.DAY_CAP);
    lib.record(doc, 'call', now); lib.record(doc, 'whatsapp', now); lib.record(doc, 'directions', now);
    expect(doc.days['2026-11-01']).toMatchObject({ call: 1, whatsapp: 1, directions: 1 });
  });

  it('90 günden eski kayıtlar silinir, 90. gün kalır', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const doc: any = { days: { '2026-08-03': { view: 1 }, '2026-08-02': { view: 1 }, '2026-01-01': { view: 9 } } };
    lib.record(doc, 'view', now);
    expect(Object.keys(doc.days).sort()).toEqual(['2026-08-03', '2026-11-01']);
  });

  it('özet: bugünden geriye 30 gün, boş günler sıfır, toplamlar doğru', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const doc: any = { days: { '2026-11-01': { view: 4, call: 1 }, '2026-10-26': { view: 2 }, '2026-10-25': { view: 10 }, '2026-10-03': { view: 7 }, '2026-10-02': { view: 100 } } };
    const s = lib.summary(doc, now);
    expect(s.days).toHaveLength(30);
    expect(s.days[0]).toMatchObject({ day: '2026-11-01', view: 4, call: 1, whatsapp: 0 });
    expect(s.days[29].day).toBe('2026-10-03');
    expect(s.totals7.view).toBe(6);   // 1 Kasım + 26 Ekim (7 gün: 26 Ekim–1 Kasım)
    expect(s.totals30.view).toBe(23); // 2 Ekim 30 günün dışında
    expect(lib.summary(null, now).totals30.view).toBe(0);
  });
});

describe('/api/hit', () => {
  it('geçerli olayı sayar, 204 döner ve çerez ayarlamaz', async () => {
    const r = await post({ e: 'view' });
    expect(r.status).toBe(204);
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(r.headers['cache-control']).toBe('no-store');
    const today = lib.istanbulDay();
    expect(stored().days[today].view).toBe(1);
  });

  it('kişiye ait bilgi saklamaz: IP, tarayıcı bilgisi ve adres belgede yoktur', async () => {
    await post({ e: 'whatsapp', ip: IP, ua: BROWSER, path: '/?urun=gizli' });
    const raw = readFileSync(join(dir, 'stats.json'), 'utf8');
    for (const secret of [IP, 'iPhone', 'Mozilla', 'gizli', HOST, 'Safari']) expect(raw, secret).not.toContain(secret);
    const doc = stored();
    expect(Object.keys(doc).sort()).toEqual(['days', 'schema']);
    for (const bucket of Object.values<any>(doc.days)) {
      expect(Object.keys(bucket).every((k) => lib.EVENTS.includes(k))).toBe(true);
      expect(Object.values(bucket).every((v) => Number.isInteger(v))).toBe(true);
    }
  });

  it('yalnızca POST, yalnızca aynı site kaynağı, yalnızca bilinen olay kabul edilir', async () => {
    expect((await run(hit, { method: 'GET', headers: { host: HOST } })).status).toBe(405);
    expect((await post({ e: 'view' }, { origin: 'https://saldirgan.example' })).status).toBe(403);
    const noOrigin = await run(hit, { method: 'POST', body: { e: 'view' }, headers: { host: HOST, 'user-agent': BROWSER } });
    expect(noOrigin.status).toBe(403);
    expect((await post({ e: 'tehlikeli' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post('{bozuk json')).status).toBe(400);
  });

  it('robotlar sayılmaz', async () => {
    const before = stored().days[lib.istanbulDay()].view;
    for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'curl/8.5.0', 'HeadlessChrome/130', 'python-requests/2.31', 'facebookexternalhit/1.1 link preview']) {
      const r = await post({ e: 'view' }, { 'user-agent': ua });
      expect(r.status, ua).toBe(204);
    }
    expect(stored().days[lib.istanbulDay()].view).toBe(before);
  });

  it('aynı anda gelen 25 istek kaybolmaz', async () => {
    const before = stored().days[lib.istanbulDay()].call || 0;
    const results = await Promise.all(Array.from({ length: 25 }, () => post({ e: 'call' })));
    expect(results.every((r) => r.status === 204)).toBe(true);
    expect(stored().days[lib.istanbulDay()].call).toBe(before + 25);
  });
});

describe('Yönetim paneli özeti', () => {
  it('oturum olmadan reddedilir; oturumla gerçek sayıları verir', async () => {
    const guest = await run(manage, { method: 'GET', query: { action: 'stats' }, headers: { host: HOST } });
    expect(guest.status).toBe(401);
    const login = await run(manage, { method: 'POST', query: { action: 'login' }, body: { username: 'alvera', password: PASSWORD }, headers: { host: HOST, origin: `http://${HOST}` } });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'].split(';')[0];
    const r = await run(manage, { method: 'GET', query: { action: 'stats' }, headers: { host: HOST, cookie } });
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(30);
    expect(r.body.totals30.view).toBe(stored().days[lib.istanbulDay()].view);
    expect(r.body.totals30.call).toBe(stored().days[lib.istanbulDay()].call);
    expect(r.body.totals30.call).toBeGreaterThanOrEqual(25);
    expect(r.body.keepDays).toBe(90);
    expect(r.headers['cache-control']).toBe('no-store');
  });
});

// Bu blok en sonda çalışır: depolamasız ortamı taklit etmek için modülleri sıfırlar.
describe('Depolama yokken', () => {
  it('sayım sessizce yutulmaz: 503 döner, ziyaretçi sayfası etkilenmez', async () => {
    vi.resetModules();
    process.env.ALPERA_LOCAL_STORAGE = '0';
    delete process.env.BLOB_STORE_ID;
    // @ts-ignore
    const bare = (await import('../api/hit.js')).default;
    const r = await run(bare, { method: 'POST', body: { e: 'view' }, headers: { host: HOST, origin: `http://${HOST}`, 'user-agent': BROWSER } });
    expect(r.status).toBe(503);
    expect(r.body.error).toBeTruthy();
  });
});
