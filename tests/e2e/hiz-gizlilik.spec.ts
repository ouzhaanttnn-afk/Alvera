// Hız ve gizlilik: yazı tipleri kendi sunucumuzdan gelir, Google'a istek gitmez, 3D sayfa yüklendikten sonra başlar.
import { expect, test } from '@playwright/test';

const noExternal = (page: import('@playwright/test').Page) => {
  const hosts = new Set<string>();
  page.on('request', (request) => { try { hosts.add(new URL(request.url()).host); } catch { /* data: gibi adresler */ } });
  return hosts;
};

test('ziyaretçinin tarayıcısı Google yazı tipi sunucularına hiç istek göndermez', async ({ page }) => {
  const hosts = noExternal(page);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  for (const host of hosts) expect(host, host).not.toMatch(/googleapis|gstatic|google/);
});

test('yazı tipleri gerçekten yüklenir; Türkçe harfler doğru dosyadan gelir', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const manrope = await document.fonts.load("400 16px Manrope", 'ğşİıçöü');
    const serif = await document.fonts.load("400 40px 'Cormorant Garamond'", 'Değer zamansızdır.');
    return {
      manrope: manrope.map((f) => f.status),
      serif: serif.map((f) => f.status),
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    };
  });
  expect(result.manrope.length).toBeGreaterThan(0);
  expect(result.manrope.every((s) => s === 'loaded')).toBe(true);
  expect(result.serif.every((s) => s === 'loaded')).toBe(true);
  expect(result.loaded).toEqual(expect.arrayContaining(['Manrope', 'Cormorant Garamond']));
});

test("'ı' harfi gereksiz yere latin-ext dosyasını indirtmez (CSS sırası)", async ({ page }) => {
  const files: string[] = [];
  page.on('request', (request) => { if (/\.woff2$/.test(request.url())) files.push(request.url().split('/').pop()!); });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  // Yalnızca latin harf ve 'ı' içeren italik başlıklar var; italik latin-ext dosyası hiç istenmemeli.
  expect(files.some((f) => f.includes('italic-latin.woff2'))).toBe(true);
  expect(files.some((f) => f.includes('italic-latin-ext'))).toBe(false);
});

test('3D kitaplık sayfa yüklendikten sonra indirilir, ilk çizimi yarıştırmaz', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => performance.getEntriesByType('resource').some((e) => /three\.module/.test(e.name)), null, { timeout: 15000 });
  const timing = await page.evaluate(() => ({
    three: performance.getEntriesByType('resource').find((e) => /three\.module/.test(e.name))!.startTime,
    loaded: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).loadEventStart,
  }));
  expect(timing.loaded).toBeGreaterThan(0);
  expect(timing.three).toBeGreaterThanOrEqual(timing.loaded);
});

test('veri tasarrufu açıkken 3D kitaplık hiç indirilmez, SVG simge görünür kalır', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' }, configurable: true });
  });
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await page.goto('/');
  await page.waitForTimeout(5000);
  expect(urls.some((url) => /three\./.test(url))).toBe(false);
  await expect(page.locator('.sculpture-fallback img')).toBeVisible();
  await expect(page.locator('#sculpture-stage')).not.toHaveClass(/is-ready/);
});
