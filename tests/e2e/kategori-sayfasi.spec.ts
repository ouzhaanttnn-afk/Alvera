// Kategori sayfası (/kategori/<anahtar>): sentetik katalog, gerçek ürün verisi kullanılmaz.
import { expect, test, type Page } from '@playwright/test';

const media = (n: number) => ({ id: `0000000${n}-1111-4111-8111-111111111111`, url: '/assets/alvera-logo.png', name: 'sentetik', type: 'image/png', width: 1010, height: 360 });
const product = (n: number, name: string, category: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id: `0000000${n}-2222-4222-8222-222222222222`, name, category, images: [media(n).id], description: 'Sentetik açıklama', metal: '', sku: '', visible: true, archived: false, order: n, createdAt, ...extra,
});
const PRODUCTS = [
  product(1, 'Zarif yüzük', 'yuzuk', '2026-11-01T10:00:00Z', { sku: 'YZ-1', metal: '14 ayar (sentetik)' }),
  product(2, 'Asma yüzük', 'yuzuk', '2026-11-20T10:00:00Z'),
  product(3, 'Çizgi yüzük', 'yuzuk', '2026-11-10T10:00:00Z'),
  product(4, 'İnce kolye', 'kolye', '2026-11-05T10:00:00Z'),
];
const CATEGORIES = { pirlanta: 'Pırlanta', yuzuk: 'Yüzük', kolye: 'Kolye', kupe: 'Küpe', bileklik: 'Bileklik', bilezik: 'Bilezik', hediye: 'Hediye', ozel: 'Özel seçki' };

async function mock(page: Page, products = PRODUCTS) {
  await page.route('**/api/catalog', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ revision: 't', settings: { whatsapp: '905334853040', siteUrl: 'https://www.alverakuyumculuk.com' }, products, media: [1, 2, 3, 4].map(media), categories: CATEGORIES }) }));
}
const names = (page: Page) => page.locator('[data-k-grid] .k-card strong').allTextContents();

test('yalnızca o kategorinin ürünleri listelenir; sıralama çalışır ve hatırlanır', async ({ page }) => {
  await mock(page);
  await page.goto('/kategori/yuzuk');
  await expect(page).toHaveTitle('Yüzük Modelleri | Alvera Kuyumculuk');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Yüzük');
  await expect(page.locator('[data-k-count]')).toHaveText('3 model');
  expect(await names(page)).toEqual(['Zarif yüzük', 'Asma yüzük', 'Çizgi yüzük']);
  await page.locator('[data-k-sort]').selectOption('yeni');
  expect(await names(page)).toEqual(['Asma yüzük', 'Çizgi yüzük', 'Zarif yüzük']);
  await page.locator('[data-k-sort]').selectOption('az');
  expect(await names(page)).toEqual(['Asma yüzük', 'Çizgi yüzük', 'Zarif yüzük']);
  await page.reload();
  await expect(page.locator('[data-k-sort]')).toHaveValue('az');
  await expect(page.locator('.k-tab[aria-current="page"]')).toContainText('Yüzük');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.alverakuyumculuk.com/kategori/yuzuk');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('ürün penceresi açılır, bağlantısı paylaşılabilir, geri tuşuyla kapanır', async ({ page }) => {
  await mock(page);
  await page.goto('/kategori/yuzuk');
  await page.locator('.k-card', { hasText: 'Zarif yüzük' }).click();
  const dialog = page.locator('[data-k-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('Zarif yüzük');
  await expect(dialog).toContainText('Yüzük / YZ-1');
  await expect(dialog).toContainText('14 ayar (sentetik)');
  await expect(page).toHaveURL(/\/kategori\/yuzuk\?urun=00000001-/);
  const ask = decodeURIComponent((await dialog.locator('[data-k-dask]').getAttribute('href'))!);
  expect(ask).toMatch(/^https:\/\/wa\.me\/905334853040\?text=Merhaba, Zarif yüzük \(YZ-1\) hakkında bilgi almak istiyorum\. http/);
  await page.goBack();
  await expect(dialog).toBeHidden();
  // Doğrudan bağlantıyla açılınca ürün penceresi hazır gelir.
  await page.goto('/kategori/yuzuk?urun=00000003-2222-4222-8222-222222222222');
  await expect(dialog.getByRole('heading')).toHaveText('Çizgi yüzük');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('boş kategori mağazaya yönlendirir; olmayan kategori "bulunamadı" der', async ({ page }) => {
  await mock(page);
  await page.goto('/kategori/kupe');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Küpe');
  await expect(page.locator('[data-k-empty]')).toBeVisible();
  await expect(page.locator('[data-k-tools]')).toBeHidden();
  expect(decodeURIComponent((await page.locator('[data-k-ask]').getAttribute('href'))!)).toContain('Küpe modelleri');
  await page.goto('/kategori/olmayan');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kategori bulunamadı');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('katalog alınamazsa ürün uydurulmaz, açıklayıcı mesaj gösterilir', async ({ page }) => {
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/kategori/yuzuk');
  await expect(page.locator('[data-k-grid]')).toContainText('yüklenemedi');
  await expect(page.locator('.k-card')).toHaveCount(0);
});
