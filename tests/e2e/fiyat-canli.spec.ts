// Canlı fiyat yenileme ve yönetim panelindeki fiyat ayarları (yerel depolama, sentetik veri; gerçek fiyat kullanılmaz).
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const price = (code: string, name: string, buy: string, sell: string) => ({ code, name, buy, sell });
const payload = (gramBuy: string, gramSell: string) => ({
  source_updated_at: new Date().toISOString(),
  prices: [
    price('PGA', 'Gram Altın', gramBuy, gramSell),
    price('PC', 'Çeyrek Altın', '9.972', '10.520'),
    price('PY', 'Yarım Altın', '19.926', '21.035'),
    price('PA', 'Ata Cumhuriyet', '40.978', '44.255'),
    price('PB', '22 Ayar Bilezik', '5.683', '6.105'),
  ],
});

test.describe('Canlı fiyat tablosu', () => {
  test('Yenile düğmesi olmadan 15 saniyede bir yenilenir; değişen fiyat yönüyle işaretlenir', async ({ page }) => {
    await page.clock.install();
    let calls = 0;
    await page.route('**/api/prices', (route) => {
      calls += 1;
      const body = calls === 1 ? payload('6.206', '6.350') : payload('6.300,50', '6.340');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const gram = page.locator('#rates-body tr', { hasText: 'Gram Altın' });
    await expect(gram).toContainText('6.206,00 ₺');
    await expect(page.locator('.rates-refresh')).toHaveCount(0);
    await expect(page.locator('#rates-status')).toHaveText('Canlı · otomatik yenilenir');
    await expect(page.locator('.rates-clock')).toContainText('Son kontrol');
    await expect(page.locator('#rates-body td.rate-up, #rates-body td.rate-down')).toHaveCount(0);

    // Saat 16 saniye ileri atlatılır (aradaki animasyon kareleri oynatılmaz); istek gerçek zamanda tamamlanır.
    await page.clock.fastForward(16000);
    await expect.poll(() => calls).toBe(2);
    await expect(gram).toContainText('6.300,50 ₺');
    await expect(gram.locator('td').nth(0)).toHaveClass(/rate-up/);
    await expect(gram.locator('td').nth(1)).toHaveClass(/rate-down/);
    // Değişmeyen satırlar işaretlenmez.
    await expect(page.locator('#rates-body tr', { hasText: 'Çeyrek Altın' }).locator('td.rate-up, td.rate-down')).toHaveCount(0);

    // Fiyat aynı kalınca işaret kalkar.
    await page.clock.fastForward(16000);
    await expect.poll(() => calls).toBe(3);
    await expect(gram).toContainText('6.300,50 ₺');
    await expect(page.locator('#rates-body td.rate-up, #rates-body td.rate-down')).toHaveCount(0);
  });
});

const DIR = '.local/e2e-katalog';
const PASSWORD = 'Sentetik-Test-Parolasi-14';

test.describe('Yönetim: fiyat ayarları', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(({ isMobile }) => isMobile, 'Veri değiştiren akış masaüstü projesinde çalışır');

  test.beforeAll(() => {
    mkdirSync(DIR, { recursive: true });
    rmSync(`${DIR}/price-rules.json`, { force: true });
    const salt = randomBytes(24).toString('hex');
    writeFileSync(`${DIR}/security.json`, JSON.stringify({ credential: { username: 'alvera', salt, hash: scryptSync(PASSWORD, salt, 64).toString('hex') }, sessions: [], attempts: {}, createdAt: new Date().toISOString() }));
  });
  test.afterAll(() => rmSync(`${DIR}/price-rules.json`, { force: true }));

  test('milyem ve işçilik değişir, hatalı değer kaydedilmez, önceki ayara dönülür', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.goto('/admin');
    await page.locator('#login-form input[name=username]').fill('alvera');
    await page.locator('#login-form input[name=password]').fill(PASSWORD);
    await page.getByRole('button', { name: /Giriş yap/ }).click();
    await expect(page.getByRole('heading', { name: 'Mağazanızın seçkisi.' })).toBeVisible();

    await page.getByRole('button', { name: 'Fiyat ayarları' }).click();
    await expect(page.getByRole('heading', { name: 'Fiyat ayarları.' })).toBeVisible();
    const form = page.locator('#prices-form');
    await expect(form.locator('[name=gram24Buy]')).toHaveValue('1001');
    await expect(form.locator('[name=gram24Sell]')).toHaveValue('1010');
    await expect(form.locator('[name=bilezik22Buy]')).toHaveValue('912');
    await expect(form.locator('[name=bilezik22Sell]')).toHaveValue('922');
    await expect(form.locator('[name=ceyrekSellExtra]')).toHaveValue('20');
    await expect(form.locator('[name=ceyrekBuyExtra]')).toHaveValue('0');
    await expect(form.locator('[name=yarimSellExtra]')).toHaveValue('0');
    await expect(page.locator('#prices-undo')).toBeDisabled();
    // Önizleme ya kaynağın o anki fiyatlarını ya da "ulaşılamadı" notunu gösterir; asla boş kalmaz.
    await expect(page.locator('#prices-source-note')).not.toHaveText('Kaynak fiyatları alınıyor…');

    // Yanlış yazım: sunucu reddeder, kayıt değişmez.
    await form.locator('[name=gram24Sell]').fill('1200');
    await page.getByRole('button', { name: 'Fiyat ayarlarını kaydet' }).click();
    await expect(page.locator('#prices-error')).toContainText('aralığın dışında');

    await form.locator('[name=gram24Sell]').fill('1012');
    await form.locator('[name=ceyrekSellExtra]').fill('25,50');
    await form.locator('[name=ceyrekBuyExtra]').fill('-15');
    await page.getByRole('button', { name: 'Fiyat ayarlarını kaydet' }).click();
    await expect(page.locator('#notice')).toContainText('Fiyat ayarları kaydedildi');
    await expect(page.locator('#prices-meta')).toContainText('alvera');
    await expect(page.locator('#prices-undo')).toBeEnabled();

    // Sayfa yeniden açılınca kayıtlı değerler gelir.
    await page.reload();
    await page.getByRole('button', { name: 'Fiyat ayarları' }).click();
    await expect(form.locator('[name=gram24Sell]')).toHaveValue('1012');
    await expect(form.locator('[name=ceyrekSellExtra]')).toHaveValue('25,50');
    await expect(form.locator('[name=ceyrekBuyExtra]')).toHaveValue('-15');

    await page.getByRole('button', { name: 'Önceki ayara dön' }).click();
    await expect(page.locator('#notice')).toContainText('Önceki ayarlara dönüldü');
    await expect(form.locator('[name=gram24Sell]')).toHaveValue('1010');
    await expect(form.locator('[name=ceyrekSellExtra]')).toHaveValue('20');
  });

  test('giriş yapmadan fiyat ayarı okunamaz ve değiştirilemez', async ({ request }) => {
    expect((await request.get('/api/manage?action=prices')).status()).toBe(401);
    const post = await request.post('/api/manage?action=prices', { data: { rules: { gram24Buy: 1001 } } });
    expect([401, 403]).toContain(post.status());
  });
});
