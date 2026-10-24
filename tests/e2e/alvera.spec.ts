import { test, expect } from '@playwright/test';
test('Existing Alvera pages and catalog remain available', async ({ page, request }) => {
 await page.goto('/'); await expect(page).toHaveTitle(/Alvera Kuyumculuk/);
 await expect(page.getByRole('link',{name:'Form sayfasına git'})).toHaveAttribute('href','/masak-form');
 expect((await request.get('/assets/alvera-wordmark.svg')).status()).toBe(200);
 expect((await request.get('/api/catalog')).status()).toBe(200);
 expect((await request.get('/api/manage')).status()).toBe(401);
 expect((await request.get('/admin')).status()).toBe(200);
 await page.goto('/masak-form');
 await expect(page.getByRole('heading',{name:'Kimlik bilgileri',exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText(/Nostos/);
});
