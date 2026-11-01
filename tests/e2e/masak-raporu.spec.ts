// ALVERA MASAK RAPORU uçtan uca akışlar — yalnızca sentetik demo verisi (playwright.config env).
import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'Demo-Sentetik-Parola-1';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function totp(secret: string) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of secret) {
    val = (val << 5) | A.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', Buffer.from(out)).update(ctr).digest();
  const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}

async function login(page: Page, email: string) {
  await page.goto('/masak-raporu/giris');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Devam et' }).click();
  await page.getByLabel('Doğrulama kodu').fill(totp(SECRET));
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Gösterge paneli' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });
// Veri oluşturan akışlar tek projede çalışır (mobil görünüm ayrıca son testte denetlenir).
test.skip(({ isMobile }) => isMobile, 'Masaüstü projesinde çalışır');

test('Test 1 — oturum açmamış kişi panele ve verilere erişemez', async ({ page, request }) => {
  await page.goto('/masak-raporu');
  await expect(page).toHaveURL(/\/masak-raporu\/giris$/);
  for (const path of ['/masak-raporu/musteriler', '/masak-raporu/islemler', '/masak-raporu/incelemeler', '/masak-raporu/raporlar']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/masak-raporu\/giris$/);
  }
  expect((await request.get('/api/masak-raporu/belge/00000000-0000-0000-0000-000000000000')).status()).toBe(401);
  const report = await request.post('/api/masak-raporu/rapor', { form: { code: 'H' }, headers: { origin: 'http://127.0.0.1:3100' } });
  expect(report.status()).toBe(401);
  const cross = await request.post('/api/masak-raporu/rapor', { form: { code: 'A' }, headers: { origin: 'https://saldirgan.example' } });
  expect(cross.status()).toBe(403);
  const head = await request.get('/masak-raporu/giris');
  expect(head.headers()['x-robots-tag']).toContain('noindex');
  expect(head.headers()['cache-control']).toContain('no-store');
});

test('Yanlış ikinci faktör kodu reddedilir', async ({ page }) => {
  await page.goto('/masak-raporu/giris');
  await page.getByLabel('E-posta').fill('personel@alvera-demo.test');
  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Devam et' }).click();
  await page.getByLabel('Doğrulama kodu').fill('000000');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('E-posta, parola veya doğrulama kodu hatalı.')).toBeVisible();
});

test('Personel: müşteri, eşik kontrolü, iptal ve gizli şüphe bildirimi', async ({ page }) => {
  await login(page, 'personel@alvera-demo.test');
  await page.goto('/masak-raporu/musteriler/yeni');
  await page.getByRole('textbox', { name: 'Ad', exact: true }).fill('E2E Sentetik');
  await page.getByLabel('Soyad').fill('Müşteri');
  await page.getByLabel('T.C. kimlik / yabancı kimlik no').fill('99999999990');
  await page.getByRole('button', { name: 'Müşteriyi kaydet' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Sentetik Müşteri' })).toBeVisible();

  const record = async (total: string) => {
    await page.getByRole('link', { name: 'Yeni işlem' }).click();
    await page.getByLabel('Ürün açıklaması').fill('E2E 22 ayar bilezik');
    await page.getByLabel('Toplam tutar').fill(total);
    await page.getByLabel('Ödeme yöntemi').selectOption('banka_karti');
    await page.getByRole('button', { name: 'İşlemi kaydet' }).click();
    await expect(page.getByText('İşlem kaydedildi ve kural motorundan geçirildi')).toBeVisible();
  };
  await record('369.999,00');
  await expect(page.getByText('Tekil işlem kimlik tespiti eşiği')).toHaveCount(0);
  const below = page.url();
  await page.getByRole('link', { name: 'E2E Sentetik Müşteri (99•••••••90)' }).click();
  await record('370.000,00');
  await expect(page.getByText('Tekil işlem kimlik tespiti eşiği')).toBeVisible();
  await expect(page.getByText(/^Kural KT-ESIK v5 ·/)).toBeVisible();
  await expect(page.getByText(/MASAK.?a bildir/i)).toHaveCount(0);

  await page.goto(below);
  await page.getByLabel('İptal gerekçesi').fill('E2E: müşteri vazgeçti, sentetik test.');
  await page.getByRole('button', { name: 'İşlemi iptal et' }).click();
  // İptal sonrası sayfa yeniden çizilir; iptal formu kalkar ve kalıcı iptal bildirimi görünür.
  await expect(page.getByText(/tarafından iptal edildi/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/tarafından iptal edildi/)).toBeVisible();
  await expect(page.getByText('E2E: müşteri vazgeçti, sentetik test.')).toBeVisible();

  await page.goto('/masak-raporu/incelemeler/yeni');
  await page.getByLabel('Kısa başlık').fill('E2E tutardan bağımsız şüphe');
  await page.getByLabel('Ne gözlemlediniz?').fill('Müşteri fon kaynağını açıklamaktan kaçındı (sentetik test).');
  await page.getByRole('button', { name: 'Yetkiliye gizli olarak ilet' }).click();
  await expect(page.getByText(/İç değerlendirme kaydı INC-\d{4}-\d{6} numarasıyla/)).toBeVisible();
  await page.goto('/masak-raporu/incelemeler');
  await expect(page).toHaveURL(/yetkisiz/);
  await page.goto('/masak-raporu/raporlar');
  await expect(page).toHaveURL(/yetkisiz/);
});

test('Uyum yetkilisi: gizli incelemeyi görür, gizli rapor ve denetim paketi üretir', async ({ page }) => {
  await login(page, 'uyum@alvera-demo.test');
  await page.goto('/masak-raporu/incelemeler');
  await expect(page.getByRole('cell', { name: 'E2E tutardan bağımsız şüphe' })).toBeVisible();
  await page.goto('/masak-raporu/raporlar');
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('form:has(input[name=code][value=H])').getByRole('button', { name: 'PDF oluştur' }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^RPR-\d{4}-\d{6}-H\.pdf$/);
  await page.goto('/masak-raporu/denetim');
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ZIP paketini oluştur ve indir' }).click()]);
  expect(zip.suggestedFilename()).toMatch(/denetim-paketi\.zip$/);
});

test('Yönetici gizli raporu üretemez; mobil görünümde yatay taşma yok', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'yonetici@alvera-demo.test');
  const overflow = await page.evaluate(() => document.querySelector('main')!.scrollWidth - document.querySelector('main')!.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.goto('/masak-raporu/raporlar');
  await expect(page.locator('form:has(input[name=code][value=H])')).toHaveCount(0);
  const res = await page.request.post('/api/masak-raporu/rapor', { form: { code: 'H', from: '2026-10-01', to: '2026-10-31' }, headers: { origin: 'http://127.0.0.1:3100' } });
  expect(res.status()).toBe(403);
});
