// JavaScript çalıştıktan sonra da (katalog ayarları uygulanınca) yapılandırılmış veri geçerli kalır.
import { expect, test } from '@playwright/test';

test('katalog ayarları uygulanınca JSON-LD bozulmaz ve tek kalır', async ({ page }) => {
  const catalog = page.waitForResponse('**/api/catalog');
  await page.goto('/');
  await catalog;
  await expect(page.locator('script#store-schema')).toHaveCount(1);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  const data = JSON.parse((await page.locator('script#store-schema').textContent()) || '{}');
  expect(data['@type']).toBe('JewelryStore');
  expect(data.telephone).toBe('+90 312 390 24 25');
  expect(data.address).toMatchObject({ addressLocality: 'Mamak', addressRegion: 'Ankara', addressCountry: 'TR' });
  expect(data.address.streetAddress).toBe('Cengizhan Mah., Natoyolu Cad. No:209/C');
  expect(data.url).toMatch(/^https:\/\//);
  for (const key of ['aggregateRating', 'review', 'openingHours']) expect(data[key]).toBeUndefined();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index/);
});
