// Çerezsiz ziyaret ve tıklama sayacı: ziyaretçi tarafında ne gönderilir, ne GÖNDERİLMEZ; yönetim özeti gerçek sayıları gösterir.
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const DIR = '.local/e2e-katalog';
const PASSWORD = 'Sentetik-Test-Parolasi-14';
const BASE = 'http://127.0.0.1:3100';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Playwright tarayıcıları kendini "robot" olarak bildirir; sayaç bunu doğru biçimde saymaz. Gerçek ziyaretçiyi taklit ederiz.
const asVisitor = (page: Page) => page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));

async function capture(page: Page) {
  const seen: { event: string; cookie?: string }[] = [];
  await page.route('**/api/hit', async (route) => {
    const request = route.request();
    seen.push({ event: request.postDataJSON().e, cookie: request.headers()['cookie'] });
    await route.fulfill({ status: 204 });
  });
  return seen;
}
const prices = JSON.stringify({
  source: 'Altınkaynak', source_updated_at: new Date().toISOString(),
  prices: [['PGA', 'Gram Altın', '6.206', '6.350'], ['PC', 'Çeyrek', '9.972', '10.520'], ['PY', 'Yarım', '19.926', '21.035'], ['PA', 'Ata', '40.978', '44.255'], ['PB', '22 Ayar', '5.683', '6.105'], ['P18', '18 Ayar', '4.298', '5.020'], ['P14', '14 Ayar', '3.522', '3.995']].map(([code, name, buy, sell]) => ({ code, name, buy, sell })),
});

test.describe('Ziyaretçi tarafı', () => {
  test('sayfa açılışı bir kez sayılır; istekle çerez gönderilmez', async ({ page, context }) => {
    await asVisitor(page);
    // Çerez gönderilmediğini kanıtlamak için önce sitenin kendi adresine bir çerez koyarız.
    await context.addCookies([{ name: 'deneme', value: 'merhaba', url: BASE }]);
    const seen = await capture(page);
    await page.goto('/');
    await expect.poll(() => seen.length).toBe(1);
    await page.waitForTimeout(800);
    expect(seen).toEqual([{ event: 'view', cookie: undefined }]);
  });

  test('iletişim tıklamaları doğru olaya çevrilir; diğer tıklamalar sayılmaz', async ({ page, context }) => {
    await asVisitor(page);
    await context.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
    await page.route('**/api/prices', (route) => route.fulfill({ contentType: 'application/json', body: prices }));
    const seen = await capture(page);
    await page.goto('/');
    await page.evaluate(() => document.addEventListener('click', (event) => event.preventDefault())); // gerçekten gitmesin
    await expect.poll(() => seen.length).toBe(1);

    for (const selector of ['a[href^="https://wa.me/"]', 'a[href^="tel:"]', 'a[href*="google.com/maps"]', 'a[href*="instagram.com"]']) {
      await page.locator(selector).first().dispatchEvent('click');
    }
    await page.locator('.hero-title').click(); // iletişim bağlantısı değil
    await page.locator('#calc-grams').fill('10');
    await page.locator('#calc-ask').dispatchEvent('click');
    await expect.poll(() => seen.map((s) => s.event)).toEqual(['view', 'whatsapp', 'call', 'directions', 'instagram', 'calculator']);
  });

  const silent: [string, (page: Page) => Promise<void>][] = [
    ['otomatik tarayıcı (robot)', async () => undefined],
    ['"izlenmek istemiyorum" (Do Not Track)', async (page) => { await asVisitor(page); await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' })); }],
    ['Global Privacy Control', async (page) => { await asVisitor(page); await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true })); }],
    ['mağaza sahibinin kendi cihazı', async (page) => { await asVisitor(page); await page.addInitScript(() => localStorage.setItem('alvera.owner', '1')); }],
  ];
  for (const [name, setup] of silent) {
    test(`sayılmaz: ${name}`, async ({ page }) => {
      await setup(page);
      const seen = await capture(page);
      await page.goto('/');
      await page.waitForLoadState('load');
      await page.locator('a[href^="tel:"]').first().dispatchEvent('click');
      await page.waitForTimeout(1200);
      expect(seen).toEqual([]);
    });
  }
});

test.describe('Yönetim özeti', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Veri oluşturan akış masaüstü projesinde çalışır');

  test.beforeAll(() => {
    mkdirSync(DIR, { recursive: true });
    rmSync(`${DIR}/stats.json`, { force: true });
    const salt = randomBytes(24).toString('hex');
    writeFileSync(`${DIR}/security.json`, JSON.stringify({ credential: { username: 'alvera', salt, hash: scryptSync(PASSWORD, salt, 64).toString('hex') }, sessions: [], attempts: {}, createdAt: new Date().toISOString() }));
  });

  test('girişsiz kimse özeti okuyamaz; girişle gerçek sayılar görünür', async ({ page, request }) => {
    const guest = await request.get('/api/manage?action=stats');
    expect(guest.status()).toBe(401);

    for (const e of ['view', 'view', 'view', 'whatsapp', 'whatsapp', 'call']) {
      const r = await request.post('/api/hit', { headers: { origin: BASE, 'user-agent': BROWSER_UA }, data: { e } });
      expect(r.status()).toBe(204);
    }
    expect((await request.post('/api/hit', { headers: { origin: BASE, 'user-agent': 'Googlebot/2.1' }, data: { e: 'view' } })).status()).toBe(204); // robot: sayılmaz
    expect((await request.post('/api/hit', { headers: { origin: 'https://saldirgan.example', 'user-agent': BROWSER_UA }, data: { e: 'view' } })).status()).toBe(403);

    await page.goto('/admin');
    await page.locator('#login-form input[name=username]').fill('alvera');
    await page.locator('#login-form input[name=password]').fill(PASSWORD);
    await page.getByRole('button', { name: /Giriş yap/ }).click();
    await expect(page.getByRole('heading', { name: 'Mağazanızın seçkisi.' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('alvera.owner'))).toBe('1');

    await page.getByRole('button', { name: 'Ziyaretler' }).click();
    await expect(page.getByRole('heading', { name: 'Siteye gelenler.' })).toBeVisible();
    await expect(page.locator('[data-stat=views7]')).toHaveText('3');
    await expect(page.locator('[data-stat=views30]')).toHaveText('3');
    await expect(page.locator('[data-stat=whatsapp30]')).toHaveText('2');
    await expect(page.locator('[data-stat=call30]')).toHaveText('1');
    const today = page.locator('#stats-body tr').first();
    await expect(today.locator('td')).toHaveText(['3', '2', '1', '0', '0', '0']);
    await expect(page.locator('#stats-body tr')).toHaveCount(14);
    await expect(page.locator('#stats-empty')).toBeHidden();
    await expect(page.locator('#view-stats')).toContainText('Çerez kullanılmaz');
  });
});
