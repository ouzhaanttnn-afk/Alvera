import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { synthetic } from '../fixtures';
import { PDFDocument } from 'pdf-lib';
const origin = 'http://127.0.0.1:3100';

test('Supabase SDK QR data URI yönetici ekranında görsel olarak yüklenir', async ({ page }) => {
  // Synthetic SVG in the exact data URI format returned by auth-js MFA enrollment.
  const qr =
    'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="white"/><rect x="10" y="10" width="30" height="30" fill="black"/></svg>';
  await page.route('**/api/masak/auth/password', (route) =>
    route.fulfill({
      json: { mfa: true, factorId: 'synthetic-factor', qr, secret: 'SYNTHETICSETUPKEY' },
    }),
  );
  await page.goto('/masak-form/admin');
  await page.getByLabel('Parola', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Güvenli giriş', exact: true }).click();
  const image = page.getByAltText('Kimlik doğrulayıcıya eklenecek TOTP QR kodu');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByLabel('Doğrulama kodu', { exact: true })).toBeVisible();
});
test('Form erişilebilirliği ve temiz ilk görünüm', async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/masak-form');
  await expect(page.getByRole('heading', { name: 'Kimlik bilgileri', exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  writeFileSync(
    `test-results/a11y-${isMobile ? 'mobile' : 'desktop'}.json`,
    JSON.stringify(result.violations, null, 2),
  );
  expect(
    result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/initial-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
});
async function token(request: APIRequestContext) {
  const r = await request.post('/api/masak/intake', { headers: { origin }, data: { captcha: '' } });
  expect(r.status()).toBe(200);
  return (await r.json()).token as string;
}
async function upload(request: APIRequestContext, t: string, kind: string) {
  let data = await sharp({
    create: {
      width: 100,
      height: 60,
      channels: 4,
      background: { r: 245, g: 250, b: 250, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  if (kind === 'signature')
    data = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><path d="M15 60 L50 15 L90 60 L125 20 L180 55" fill="none" stroke="#164e59" stroke-width="3"/></svg>',
      ),
    )
      .png()
      .toBuffer();
  if (kind === 'residence') {
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('SYNTHETIC RESIDENCE DOCUMENT');
    data = Buffer.from(await pdf.save());
  }
  const r = await request.post('/api/masak/uploads', {
    headers: {
      origin,
      'x-intake-token': t,
      'x-document-kind': kind,
      'x-file-name': kind === 'residence' ? 'synthetic.pdf' : 'synthetic.png',
      'content-type': kind === 'residence' ? 'application/pdf' : 'image/png',
    },
    data,
  });
  expect(r.status()).toBe(200);
  return (await r.json()).id as string;
}
async function create(request: APIRequestContext) {
  const t = await token(request);
  const docs = [];
  for (const k of ['front', 'back', 'signature', 'residence'])
    docs.push(await upload(request, t, k));
  const payload = {
    headers: { origin, 'x-intake-token': t },
    data: { data: synthetic, documents: docs },
  };
  const [a, b] = await Promise.all([
    request.post('/api/masak/applications', payload),
    request.post('/api/masak/applications', payload),
  ]);
  expect(a.status()).toBe(201);
  expect(b.status()).toBe(201);
  const result = await a.json();
  expect((await b.json()).reference).toBe(result.reference);
  return { reference: result.reference as string, docs, t };
}
async function login(page: Page) {
  await page.goto('/masak-form/admin');
  await page.getByLabel('Parola', { exact: true }).fill('synthetic-e2e-only-password');
  await page.getByRole('button', { name: 'Güvenli giriş', exact: true }).click();
  await page.getByLabel('Doğrulama kodu').fill('654321');
  await page.getByRole('button', { name: 'Kodu doğrula' }).click();
  await expect(page.getByRole('heading', { name: 'Her başvuru, tek bir yerde.' })).toBeVisible();
}
test('Alan hataları ve gerçek başvuru: dosya, mobil çizim, kontrol, referans', async ({
  page,
  isMobile,
}) => {
  await page.goto('/masak-form');
  await expect(page.getByRole('img', { name: 'Alvera Kuyumculuk' })).toBeVisible();
  await page.getByRole('button', { name: 'Devam et' }).click();
  await expect(page.getByText('Bu alan zorunludur.').first()).toBeVisible();
  for (const [name, value] of Object.entries({
    name: synthetic.name,
    identityNumber: synthetic.identityNumber,
    occupation: synthetic.occupation,
    amount: synthetic.amount,
  }))
    await page.locator(`#${name}`).fill(value);
  await page.screenshot({
    path: `test-results/form-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Devam et' }).click();
  await page.getByLabel('Cep telefonu').fill(synthetic.phone);
  await page.getByLabel('E-posta adresi').fill(synthetic.email);
  await page.locator('#province').selectOption('İstanbul');
  await page.locator('#district').selectOption('Kadıköy');
  await page.getByLabel('Mahalle', { exact: false }).fill(synthetic.neighborhood);
  await page.getByLabel('Açık adres').fill(synthetic.address);
  await page.getByRole('button', { name: 'Devam et' }).click();
  const data = await sharp({ create: { width: 80, height: 50, channels: 4, background: '#fff' } })
    .png()
    .toBuffer();
  for (const id of ['front', 'back'])
    await page
      .locator(`#file-${id}`)
      .setInputFiles({ name: 'sentetik.png', mimeType: 'image/png', buffer: data });
  await expect(page.getByAltText('Kimlik ön yüzü önizleme')).toBeVisible();
  const residence = page.locator('#file-residence');
  await residence.setInputFiles({ name: 'wrong.png', mimeType: 'image/png', buffer: data });
  await expect(page.locator('#file-residence-error')).toContainText('yalnızca PDF');
  const residencePdf = await PDFDocument.create();
  residencePdf.addPage().drawText('SYNTHETIC RESIDENCE DOCUMENT');
  await residence.setInputFiles({
    name: 'sentetik-ikamet.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await residencePdf.save()),
  });
  await expect(page.getByRole('link', { name: 'İkametgâh belgesi PDF önizleme' })).toBeVisible();
  const canvas = page.getByRole('img', { name: 'İmza çizim alanı' });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + 30, y: box.y + 40 }],
    });
    for (let i = 1; i <= 12; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: box.x + 30 + i * 8, y: box.y + 40 + Math.sin(i) * 15 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(box.x + 30, box.y + 40);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++)
      await page.mouse.move(box.x + 30 + i * 8, box.y + 40 + Math.sin(i) * 15);
    await page.mouse.up();
  }
  await expect(page.locator('.signature-pad')).toHaveClass(/has-ink/);
  await page.getByRole('button', { name: 'Devam et' }).click();
  await page.getByRole('button', { name: 'Geri', exact: true }).click();
  await expect(page.getByAltText('Kimlik ön yüzü önizleme')).toBeVisible();
  await expect(page.locator('.signature-pad')).toHaveClass(/has-ink/);
  await expect
    .poll(() =>
      page
        .locator('canvas')
        .evaluate((el) =>
          Array.from(
            (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 720, 220).data,
          ).some((v, i) => i % 4 === 3 && v > 0),
        ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Devam et' }).click();
  await page.getByRole('button', { name: 'Aydınlatma metnini görüntüle' }).click();
  await expect(page.locator('.privacy-text')).toContainText('GELİŞTİRME ORTAMI');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Başvuruyu gönder' }).click();
  await expect(page.getByRole('heading', { name: 'İlk adım tamamlandı.' })).toBeVisible();
  await expect(page.locator('.reference-card strong')).toContainText(/^NF-\d{4}-\d{6,}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('Yetkisiz erişim, CSRF, bozuk veri, dosya tür ve boyut reddi', async ({ request }) => {
  for (const path of [
    '/api/masak/admin/session',
    '/api/masak/admin/applications',
    '/api/masak/admin/documents/00000000-0000-4000-8000-000000000000',
    '/api/masak/admin/applications/00000000-0000-4000-8000-000000000000/pdf',
  ])
    expect((await request.get(path)).status()).toBe(401);
  expect(
    (
      await request.post('/api/masak/intake', {
        headers: { origin: 'https://evil.invalid' },
        data: { captcha: '' },
      })
    ).status(),
  ).toBe(403);
  const t = await token(request);
  expect(
    (
      await request.post('/api/masak/applications', {
        headers: { origin, 'x-intake-token': t },
        data: { data: { ...synthetic, identityNumber: '123' }, documents: [] },
      })
    ).status(),
  ).toBe(422);
  const headers = {
    origin,
    'x-intake-token': t,
    'x-document-kind': 'front',
    'x-file-name': 'x.png',
    'content-type': 'image/png',
  };
  expect(
    (await request.post('/api/masak/uploads', { headers, data: Buffer.from('fake png') })).status(),
  ).toBe(400);
  expect(
    (await request.post('/api/masak/uploads', { headers, data: Buffer.alloc(6 * 1024 * 1024) })).status(),
  ).toBe(413);
  expect(
    (
      await request.post('/api/masak/uploads', {
        headers: { ...headers, 'x-document-kind': 'residence' },
        data: Buffer.from('fake png'),
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await request.post('/api/masak/uploads', {
        headers: {
          ...headers,
          'x-document-kind': 'residence',
          'x-file-name': 'fake.pdf',
          'content-type': 'application/pdf',
        },
        data: Buffer.from('fake pdf'),
      })
    ).status(),
  ).toBe(400);
});
test('Çift gönderim tek kayıt; yönetim, filtre, durum, not, belge ve PDF', async ({
  page,
  request,
  isMobile,
}) => {
  const created = await create(request);
  await login(page);
  await page.getByLabel('Referans numarası').fill(created.reference);
  await page.getByRole('button', { name: 'Ara', exact: true }).click();
  await expect(page.getByRole('button', { name: created.reference, exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: created.reference, exact: true }).click();
  await expect(page.getByRole('heading', { name: created.reference })).toBeVisible();
  await expect(page.getByText('*******0146', { exact: true })).toBeVisible();
  expect(await page.locator('body').textContent()).not.toContain(synthetic.identityNumber);
  await page.getByRole('button', { name: 'Durumu güncelle' }).click();
  await expect(page.locator('.detail-meta .admin-status')).toHaveText('İnceleniyor');
  await page.getByLabel('Yeni not', { exact: true }).fill('Sentetik değerlendirme notu.');
  await page.getByRole('button', { name: 'Notu kaydet' }).click();
  await expect(page.getByText('Sentetik değerlendirme notu.', { exact: true })).toBeVisible();
  const pdfUrl = await page.getByRole('link', { name: 'PDF indir' }).getAttribute('href');
  const pdf = await page.request.get(pdfUrl!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  mkdirSync('tmp/pdfs', { recursive: true });
  writeFileSync('tmp/pdfs/synthetic-application.pdf', await pdf.body());
  const doc = await page.request.get(`/api/masak/admin/documents/${created.docs[0]}`);
  expect(doc.status()).toBe(200);
  expect(doc.headers()['cache-control']).toContain('no-store');
  await page.screenshot({
    path: `test-results/admin-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Silme talebi oluştur' }).click();
  await expect(page.getByText('Silme talebi açılmıştır.', { exact: false })).toBeVisible();
  await page.getByLabel(`Onaylamak için ${created.reference} yazın`).fill(created.reference);
  await page.getByRole('button', { name: 'Kalıcı sil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Her başvuru, tek bir yerde.' })).toBeVisible();
  expect((await page.request.get(`/api/masak/admin/documents/${created.docs[0]}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Güvenli çıkış' }).click();
  await expect(page.getByRole('heading', { name: 'Yönetici girişi' })).toBeVisible();
  expect((await request.get(`/api/masak/admin/documents/${created.docs[0]}`)).status()).toBe(401);
});
test('Parola tek başına yönetici yetkisi vermez, yanlış ikinci aşama reddedilir', async ({
  request,
}) => {
  expect(
    (
      await request.post('/api/masak/auth/password', {
        headers: { origin },
        data: { email: '', password: 'wrong' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post('/api/masak/auth/password', {
        headers: { origin },
        data: { email: '', password: 'synthetic-e2e-only-password' },
      })
    ).status(),
  ).toBe(200);
  expect((await request.get('/api/masak/admin/applications')).status()).toBe(401);
  expect(
    (
      await request.post('/api/masak/auth/mfa', { headers: { origin }, data: { code: '000000' } })
    ).status(),
  ).toBe(401);
});
test('Başkasının yüklemesi bağlanamaz; yeni upload tamamlanmış başvuruya eklenemez', async ({
  request,
}) => {
  const t = await token(request),
    other = await token(request);
  const doc = await upload(request, t, 'front');
  expect(
    (
      await request.post('/api/masak/applications', {
        headers: { origin, 'x-intake-token': other },
        data: { data: synthetic, documents: [doc] },
      })
    ).status(),
  ).toBe(403);
  const completed = await create(request);
  const invalid = await request.post('/api/masak/uploads', {
    headers: {
      origin,
      'x-intake-token': completed.t,
      'x-document-kind': 'front',
      'x-file-name': 'x.png',
      'content-type': 'image/png',
    },
    data: Buffer.from('fake'),
  });
  expect(invalid.status()).toBe(409);
});
