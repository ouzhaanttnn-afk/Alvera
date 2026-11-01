// Mağaza yönetimi: toplu ürün ekleme ve hızlı yayımlama (yerel katalog, sentetik veri).
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

const DIR = '.local/e2e-katalog';
const PASSWORD = 'Sentetik-Test-Parolasi-14';

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return ~c >>> 0;
}
function png(seed: number) {
  const w = 96, h = 96, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = (x * 7 + y * 13 + seed * 29) & 255; }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe.configure({ mode: 'serial' });
test.skip(({ isMobile }) => isMobile, 'Veri oluşturan akış masaüstü projesinde çalışır');

test.beforeAll(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const salt = randomBytes(24).toString('hex');
  writeFileSync(`${DIR}/security.json`, JSON.stringify({ credential: { username: 'alvera', salt, hash: scryptSync(PASSWORD, salt, 64).toString('hex') }, sessions: [], attempts: {}, createdAt: new Date().toISOString() }));
});

test('Toplu ekleme: taslaklar oluşur, bozuk dosya ayrılır, yalnızca yayımlanan sitede görünür', async ({ page, request }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/admin');
  await page.locator('#login-form input[name=username]').fill('alvera');
  await page.locator('#login-form input[name=password]').fill(PASSWORD);
  await page.getByRole('button', { name: /Giriş yap/ }).click();
  await expect(page.getByRole('heading', { name: 'Mağazanızın seçkisi.' })).toBeVisible();

  await page.getByRole('button', { name: /Toplu ekle/ }).click();
  await page.getByLabel('Hepsi için kategori').selectOption('yuzuk');
  await page.locator('#bulk-files').setInputFiles([
    { name: 'solitaire-yuzuk.png', mimeType: 'image/png', buffer: png(1) },
    { name: 'IMG_20261101_101010.png', mimeType: 'image/png', buffer: png(2) },
    { name: 'bozuk.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('bu bir fotograf degil, bozuk dosya '.repeat(4)) },
    { name: 'foto.heic', mimeType: 'image/heic', buffer: Buffer.from('heic') },
  ]);
  await expect(page.locator('#notice')).toContainText('1 dosya JPEG, PNG veya WebP olmadığı için atlandı');
  await expect(page.locator('.bulk-row')).toHaveCount(3);
  await expect(page.locator('[data-bulk-name]').nth(0)).toHaveValue('Solitaire yuzuk');
  await expect(page.locator('[data-bulk-name]').nth(1)).toHaveValue('');
  await expect(page.locator('[data-bulk-name]').nth(1)).toHaveAttribute('placeholder', 'Yüzük 2');
  await page.locator('[data-bulk-category]').nth(1).selectOption('kolye');
  await expect(page.locator('[data-bulk-name]').nth(1)).toHaveAttribute('placeholder', 'Kolye 2');

  await page.getByRole('button', { name: '3 taslak ürün oluştur' }).click();
  await expect(page.locator('#notice')).toContainText('2 ürün oluşturuldu; 1 fotoğraf yüklenemedi');
  await expect(page.locator('.bulk-row')).toHaveCount(1);
  await expect(page.locator('.bulk-state')).toContainText('Fotoğraf okunamadı');
  await page.getByRole('button', { name: 'Vazgeç' }).first().click();

  await expect(page.locator('.product-row')).toHaveCount(2);
  await expect(page.locator('#stat-draft')).toHaveText('2');
  await expect(page.locator('.product-row', { hasText: 'Solitaire yuzuk' }).locator('.badge')).toHaveText('Taslak');
  await expect(page.locator('.product-row', { hasText: 'Kolye 2' })).toBeVisible();
  expect((await (await request.get('/api/catalog')).json()).products).toEqual([]);

  await page.locator('.product-row', { hasText: 'Solitaire yuzuk' }).getByRole('button', { name: 'Yayımla' }).click();
  await expect(page.locator('#notice')).toContainText('Ürün yayımlandı');
  await expect(page.locator('#stat-live')).toHaveText('1');
  const live = (await (await request.get('/api/catalog')).json()).products;
  expect(live.map((p: { name: string }) => p.name)).toEqual(['Solitaire yuzuk']);

  await page.locator('.product-row', { hasText: 'Solitaire yuzuk' }).getByRole('button', { name: 'Yayından al' }).click();
  await expect(page.locator('#stat-live')).toHaveText('0');
  expect((await (await request.get('/api/catalog')).json()).products).toEqual([]);
});
