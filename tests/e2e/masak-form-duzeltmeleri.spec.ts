// MASAK müşteri formu: müşteriye anlamlı açıklama, doğru klavye, personel bağlantısı yok.
import { expect, test } from '@playwright/test';
import { synthetic } from '../fixtures';

test('kimlik adımı: amaç notu, yeni sekmede aydınlatma bağlantısı, doğru klavyeler', async ({ page }) => {
  await page.goto('/masak-form');
  await expect(page.getByRole('heading', { name: 'Kimlik bilgileri', exact: true })).toBeVisible();

  const note = page.locator('.identity-purpose');
  await expect(note).toContainText('müşteri tanıma yükümlülükleri kapsamında istenir');
  const link = note.getByRole('link', { name: /Gizlilik ve aydınlatma metninde/ });
  await expect(link).toHaveAttribute('href', '/masak-form/privacy');
  await expect(link).toHaveAttribute('target', '_blank'); // doldurulan form kaybolmasın
  await expect(link).toHaveAttribute('rel', /noopener/);

  // Kimlik/vergi numarası yalnızca rakamdır; tutar ondalık olabilir.
  await expect(page.locator('#identityNumber')).toHaveAttribute('inputmode', 'numeric');
  await expect(page.locator('#amount')).toHaveAttribute('inputmode', 'decimal');
  await expect(page.locator('#occupation')).not.toHaveAttribute('inputmode', /.+/);

  // Müşteri sayfasında personel bağlantısı ve dolgu metni yok; alt bilgi işletme adını taşır.
  await expect(page.locator('header')).not.toContainText('Yönetim paneli');
  await expect(page.locator('a[href="/masak-form/admin"]')).toHaveCount(0);
  await expect(page.locator('footer')).toContainText('Alvera Kuyumculuk');
  await expect(page.locator('footer')).not.toContainText('Alvera Form');
  await expect(page.locator('footer')).not.toContainText('Özenle tasarlandı');
});

test('amaç notu yalnızca kimlik adımında görünür', async ({ page }) => {
  await page.goto('/masak-form');
  for (const [name, value] of Object.entries({ name: synthetic.name, identityNumber: synthetic.identityNumber, occupation: synthetic.occupation, amount: synthetic.amount }))
    await page.locator(`#${name}`).fill(value);
  await page.getByRole('button', { name: 'Devam et' }).click();
  await expect(page.getByLabel('Cep telefonu')).toBeVisible();
  await expect(page.locator('.identity-purpose')).toHaveCount(0);
});
