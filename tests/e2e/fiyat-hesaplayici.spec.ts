// Altın fiyat paneli ve gram hesaplayıcı: /api/prices yanıtı taklit edilir, gerçek fiyat kullanılmaz.
import { expect, test, type Page } from '@playwright/test';

const price = (code: string, name: string, buy: string, sell: string) => ({ code, name, buy, sell });
function payload(extra: Record<string, unknown> = {}, withKarats = true) {
  return {
    source_updated_at: new Date().toISOString(),
    prices: [
      price('PGA', 'Gram Altın', '6.206', '6.350'),
      price('PC', 'Çeyrek Altın', '9.972', '10.520'),
      price('PY', 'Yarım Altın', '19.926', '21.035'),
      price('PA', 'Ata Cumhuriyet', '40.978', '44.255'),
      price('PB', '22 Ayar Bilezik', '5.683', '6.105'),
      ...(withKarats ? [price('P18', '18 Ayar Altın', '4.298', '5.020'), price('P14', '14 Ayar Altın', '3.522', '3.995')] : []),
    ],
    ...extra,
  };
}
async function open(page: Page, body: unknown, status = 200, rows = true) {
  await page.route('**/api/prices', (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
  await page.goto('/');
  // Başarılı yanıtta satırlar, başarısızda "alınamıyor" durumu beklenir.
  if (rows) await expect(page.locator('#rates-body th').first()).toBeVisible();
  else await expect(page.locator('.rates-panel')).toHaveAttribute('data-state', 'error');
}

test.describe('Gram hesaplayıcı', () => {
  test('alış ve satış değerini doğru ve kuruşa kadar hesaplar', async ({ page }) => {
    await open(page, payload());
    const result = page.locator('#calc-result');
    await page.selectOption('#calc-karat', '22');
    await page.fill('#calc-grams', '12,5');
    // 12,5 g × 5.683 ₺ = 71.037,50 ₺ ; 12,5 g × 6.105 ₺ = 76.312,50 ₺
    await expect(result).toContainText('71.037,50 ₺');
    await expect(result).toContainText('76.312,50 ₺');
    await page.selectOption('#calc-karat', '14');
    await page.fill('#calc-grams', '0,001');
    // 0,001 g × 3.522 ₺ = 3,52 ₺ ; × 3.995 ₺ = 4,00 ₺ (kuruşa yuvarlanır)
    await expect(result).toContainText('3,52 ₺');
    await expect(result).toContainText('4,00 ₺');
    await expect(page.locator('.rates-calc-note')).toContainText('fiyat teklifi değildir');
  });

  test('geçersiz gram değerinde sonuç göstermez ve soru butonu kapalı kalır', async ({ page }) => {
    await open(page, payload());
    for (const bad of ['abc', '0', '-3', '1,2345', '1.2.3', '100001']) {
      await page.fill('#calc-grams', bad);
      await expect(page.locator('#calc-result dl'), bad).toHaveCount(0);
      await expect(page.locator('#calc-ask'), bad).toBeDisabled();
    }
    await page.fill('#calc-grams', '');
    await expect(page.locator('#calc-result')).toContainText('Gram girin');
  });

  test('14/18 ayar fiyatı gelmezse yalnızca o seçenekler kalkar', async ({ page }) => {
    await open(page, payload({}, false));
    await expect(page.locator('#rates-calc')).toBeVisible();
    await expect(page.locator('#calc-karat option:not([hidden])')).toHaveCount(2);
    await page.selectOption('#calc-karat', '24');
    await page.fill('#calc-grams', '10');
    await expect(page.locator('#calc-result')).toContainText('62.060,00 ₺');
  });

  test('mağazaya sor düğmesi gram ve ayarı WhatsApp mesajına yazar', async ({ page, context }) => {
    await context.route('https://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
    await open(page, payload());
    await page.selectOption('#calc-karat', '18');
    await page.fill('#calc-grams', '7.5');
    const popup = page.waitForEvent('popup');
    await page.click('#calc-ask');
    const url = new URL((await popup).url());
    expect(url.pathname).toMatch(/^\/\d{10,15}$/);
    expect(url.searchParams.get('text')).toBe('Merhaba, 7,5 gram 18 ayar altın için bilgi almak istiyorum.');
  });
});

test.describe('Fiyat paneli durumları', () => {
  test('kaynak çökünce sunucu son başarılı fiyatları eski işaretiyle verir ve panel bunu açıkça söyler', async ({ page }) => {
    const old = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    await open(page, payload({ stale: true, source_updated_at: old }));
    await expect(page.locator('#rates-status')).toContainText('Kaynağa şu an ulaşılamıyor');
    await expect(page.locator('.rates-panel')).toHaveAttribute('data-state', 'stale');
    await expect(page.locator('#rates-body th')).toHaveCount(5);
    await expect(page.locator('#rates-calc')).toBeVisible();
  });

  test('hizmet hatasında ve önbellek yokken fiyat uydurulmaz, hesaplayıcı gizlenir', async ({ page }) => {
    await open(page, { error: 'yok' }, 503, false);
    await expect(page.locator('#rates-status')).toContainText('alınamıyor');
    await expect(page.locator('#rates-calc')).toBeHidden();
    await expect(page.locator('#rates-body')).not.toContainText('₺');
  });

  test('bozuk fiyat verisi reddedilir', async ({ page }) => {
    await open(page, payload({ prices: [price('PGA', 'Gram Altın', 'yaklaşık 6200', '6.350')] }), 200, false);
    await expect(page.locator('#rates-body')).not.toContainText('₺');
    await expect(page.locator('#rates-calc')).toBeHidden();
  });
});

test.describe('Has Altın satırı', () => {
  const has = (buy: string, sell: string) => price('HAS', 'Has Altın', buy, sell);

  test('varsa tablonun ilk satırı olur ve değerleri aynen gösterir', async ({ page }) => {
    await open(page, payload({ prices: [has('6.632,38', '6.662,31'), ...payload().prices] }));
    await expect(page.locator('#rates-body th')).toHaveCount(6);
    const first = page.locator('#rates-body tr').first();
    await expect(first).toContainText('Has Altın');
    await expect(first).toContainText('6.632,38 ₺');
    await expect(first).toContainText('6.662,31 ₺');
    await expect(page.locator('#rates-body tr').nth(1)).toContainText('Gram Altın');
  });

  test('yoksa ya da bozuksa tablo 5 satırla çalışır; hata sayılmaz', async ({ page }) => {
    await open(page, payload());
    await expect(page.locator('#rates-body th')).toHaveCount(5);
    await expect(page.locator('#rates-body')).not.toContainText('Has Altın');
    await open(page, payload({ prices: [has('yaklaşık', '6.662,31'), ...payload().prices] }));
    await expect(page.locator('#rates-body th')).toHaveCount(5);
    await expect(page.locator('.rates-panel')).not.toHaveAttribute('data-state', 'error');
  });
});
