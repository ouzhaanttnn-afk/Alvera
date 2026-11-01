// Çalışan sitede: panel ana ekrana eklenebilir, herkese açık sayfa panele bağlantı vermez.
import { expect, test } from '@playwright/test';

test('herkese açık sayfa yönetim paneline hiç bağlantı vermez (katalog yüklendikten sonra da)', async ({ page }) => {
  const catalog = page.waitForResponse('**/api/catalog');
  await page.goto('/');
  await catalog;
  await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Yönetim paneli');
  await expect(page.locator('footer')).toContainText('YUKARI DÖN'); // altbilgi bozulmadı
});

test('yönetim sayfası geçerli bir manifest ve ikonlarla servis edilir', async ({ page, request }) => {
  await page.goto('/admin');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/assets/admin/manifest.webmanifest');
  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.start_url).toBe('/admin');
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  const touch = await request.get(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href') as string);
  expect(touch.status()).toBe(200);
  // Panel sayfası arama motorlarına kapalı kalır.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
