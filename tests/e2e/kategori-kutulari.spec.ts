// Ana sayfadaki kategori kutuları: sekiz kutu (Hediye ve Özel seçki dahil), düzen ve ürün geldiğinde fotoğrafa dönüşme.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const KEYS = ['pirlanta', 'yuzuk', 'kolye', 'kupe', 'bileklik', 'bilezik', 'hediye', 'ozel'];

async function withProduct(page: Page, request: APIRequestContext, category: string) {
  const base = await (await request.get('/api/catalog')).json();
  const media = { id: '11111111-1111-4111-8111-111111111111', url: '/assets/alvera-logo.png', name: 'sentetik', type: 'image/png', width: 1010, height: 360 };
  const product = { id: '22222222-2222-4222-8222-222222222222', name: 'Sentetik hediye seti', category, images: [media.id], description: 'Test ürünü', metal: '', sku: '', visible: true, archived: false, order: 0 };
  await page.route('**/api/catalog', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...base, products: [product], media: [media] }) }));
}

test('sekiz kategori kutusu var; fotoğrafsız kutular markalı ve mağazaya yönlendirir', async ({ page }) => {
  const catalog = page.waitForResponse('**/api/catalog');
  await page.goto('/');
  await catalog;
  const tiles = page.locator('.category-showcase [data-category-tile]');
  await expect(tiles).toHaveCount(8);
  expect(await tiles.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.categoryTile))).toEqual(KEYS);

  for (const [key, label] of [['hediye', 'Hediye'], ['ozel', 'Özel seçki']]) {
    const tile = page.locator(`[data-category-tile="${key}"]`);
    await expect(tile.locator('.category-label')).toHaveText(label);
    await expect(tile.locator('.category-action')).toHaveText('Mağazaya sor');
    await expect(tile.locator('.category-photo')).toHaveClass(/is-placeholder/);
    await expect(tile).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent((await tile.getAttribute('href'))!)).toContain(label);
  }
});

test('düzen: masaüstünde 4×2, telefonda yatay kaydırma; sayfa taşmaz', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.locator('.category-showcase').scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => {
    const box = document.querySelector('.category-showcase') as HTMLElement;
    const tops = [...box.querySelectorAll('.category-tile')].map((el) => Math.round(el.getBoundingClientRect().top));
    return { rows: new Set(tops).size, perFirstRow: tops.filter((t) => t === tops[0]).length, scrolls: box.scrollWidth > box.clientWidth + 1, pageFits: document.documentElement.scrollWidth <= window.innerWidth };
  });
  expect(layout.pageFits).toBe(true);
  if (isMobile) {
    expect(layout.scrolls).toBe(true);
    expect(layout.rows).toBe(1);
  } else {
    expect(layout.scrolls).toBe(false);
    expect(layout.rows).toBe(2);
    expect(layout.perFirstRow).toBe(4);
  }
});

test('Hediye kategorisine ürün gelince kutu fotoğrafa döner ve seçkiyi süzer; Özel seçki aynı kalır', async ({ page, request }) => {
  await withProduct(page, request, 'hediye');
  const catalog = page.waitForResponse('**/api/catalog');
  await page.goto('/');
  await catalog;

  const gift = page.locator('[data-category-tile="hediye"]');
  await expect(gift.locator('.category-action')).toHaveText('Modelleri incele');
  await expect(gift.locator('.category-photo')).not.toHaveClass(/is-placeholder/);
  await expect(gift.locator('img')).toHaveAttribute('src', '/assets/alvera-logo.png');
  await expect(gift.locator('img')).toHaveAttribute('alt', 'Sentetik hediye seti');

  const special = page.locator('[data-category-tile="ozel"]');
  await expect(special.locator('.category-action')).toHaveText('Mağazaya sor');
  await expect(special.locator('.category-photo')).toHaveClass(/is-placeholder/);
  await expect(page.locator('[data-category="ozel"]')).toHaveCount(0); // boş kategori için filtre düğmesi çıkmaz

  await gift.click();
  await expect(page.locator('[data-category="hediye"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gallery [data-product]')).toHaveCount(1);
  await expect(gift).toHaveAttribute('aria-current', 'true');
});
