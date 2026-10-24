import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { LocalStore } from '../src/lib/local-store';
import {
  applicationSchema,
  validTckn,
  validVkn,
  maskIdentity,
  provinces,
  fileSelectionError,
} from '../src/lib/validation';
import { config, publicPolicy, pageConfiguration } from '../src/lib/config';
import { encrypt, decrypt, signToken, verifyToken } from '../src/lib/crypto';
import { endpoint, HttpError, readBounded, requireOrigin, safeLog } from '../src/lib/security';
import { validateFile } from '../src/lib/storage';
import { notificationContent, processOutbox } from '../src/lib/notifications';
import { store } from '../src/lib/db';
import { submit, detail } from '../src/lib/service';
import { createApplicationPdf } from '../src/lib/pdf';
import { synthetic } from './fixtures';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('Doğrulama', () => {
  it('Dosya seçiminde uzantı, MIME, boş dosya ve boyut sınırı birlikte kontrol edilir', () => {
    expect(fileSelectionError({ name: 'sentetik.PNG', type: 'image/png', size: 64 }, 5)).toBe('');
    expect(fileSelectionError({ name: 'yanlis.exe', type: 'image/png', size: 64 }, 5)).not.toBe('');
    expect(fileSelectionError({ name: 'yanlis.pdf', type: 'image/png', size: 64 }, 5)).not.toBe('');
    expect(fileSelectionError({ name: 'bos.png', type: 'image/png', size: 0 }, 5)).toContain('Boş');
    expect(
      fileSelectionError({ name: 'buyuk.png', type: 'image/png', size: 6 * 1024 * 1024 }, 5),
    ).toContain('5 MB');
  });
  it('TCKN checksum, baştaki sıfır ve bozuk checksum', () => {
    expect(validTckn(synthetic.identityNumber)).toBe(true);
    expect(validTckn('00000000000')).toBe(false);
    expect(validTckn('10000000147')).toBe(false);
  });
  it('VKN algoritması', () => {
    const base = '123456789';
    const match = Array.from({ length: 10 }, (_, i) => base + i).filter(validVkn);
    expect(match).toHaveLength(1);
    expect(validVkn('0000000000')).toBe(false);
    expect(validVkn(match[0].slice(0, 9) + ((Number(match[0][9]) + 1) % 10))).toBe(false);
  });
  it('Geçerli başvuru; telefon, tutar, ilçe, eksik alan reddi', () => {
    const s = applicationSchema(publicPolicy());
    expect(s.safeParse(synthetic).success).toBe(true);
    for (const patch of [
      { name: '' },
      { identityNumber: '1' },
      { phone: '123' },
      { amount: '-1' },
      { email: 'wrong' },
      { district: 'Çankaya' },
      { noticeRead: false },
      { neighborhood: 'a' },
      { address: 'x' },
      { amount: '1e5' },
    ])
      expect(s.safeParse({ ...synthetic, ...patch }).success).toBe(false);
  });
  it('Yapılandırılabilir zorunluluk ve coğrafya', () => {
    expect(
      applicationSchema({ required: [] }).safeParse({ ...synthetic, phone: '', identityNumber: '' })
        .success,
    ).toBe(true);
    expect(Object.keys(provinces)).toHaveLength(81);
    expect(provinces['İstanbul']).toContain('Kadıköy');
    expect(maskIdentity('10000000146')).toBe('*******0146');
  });
});
describe('Güvenlik', () => {
  it('Yönetici kurulumu başvuru kapalıyken açılır; intake ve eksik admin anahtarı kapalı kalır', async () => {
    vi.stubEnv('APP_MODE', 'supabase');
    vi.stubEnv('APP_URL', 'https://forms.example.invalid');
    vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'synthetic-anon');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service');
    vi.stubEnv('CRON_SECRET', Buffer.alloc(32, 1).toString('base64'));
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('LEGAL_REVIEW_APPROVED', 'false');
    expect(config('admin').local).toBe(false);
    expect(() => config()).toThrow('CONFIG_MISSING_RESEND_API_KEY');
    expect((await endpoint(async () => Response.json({ ok: true }), 'admin')).status).toBe(200);
    const operation = vi.fn(async () => Response.json({ ok: true }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await endpoint(operation)).status).toBe(503);
    expect(operation).not.toHaveBeenCalled();
    vi.stubEnv('TOKEN_SECRET', '');
    expect(() => config('admin')).toThrow('CONFIG_MISSING_TOKEN_SECRET');
    expect((await endpoint(operation, 'admin')).status).toBe(503);
    expect(operation).not.toHaveBeenCalled();
  });
  it('Vercel preview formu gösterir; API konfigürasyonu ve production kapalı kalır', () => {
    vi.stubEnv('APP_MODE', 'supabase');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('SUPABASE_URL', '');
    expect(() => config()).toThrow();
    expect(pageConfiguration().policy).toMatchObject({
      previewOnly: true,
      documents: true,
      signature: true,
      local: false,
    });
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => pageConfiguration()).toThrow();
  });
  it('Şifreleme bütünlüğü ve farklı IV', () => {
    const a = encrypt(synthetic),
      b = encrypt(synthetic);
    expect(a).not.toBe(b);
    expect(a).not.toContain(synthetic.name);
    expect(decrypt(a)).toEqual(synthetic);
    expect(() => decrypt(a.slice(0, -5) + 'aaaaa')).toThrow();
  });
  it('Yetki tokenı süre, imza ve amaç doğrulaması', () => {
    const t = signToken({ purpose: 'intake', id: 'test' });
    expect(verifyToken(t, 'intake')).toMatchObject({ id: 'test' });
    expect(() => verifyToken(t, 'admin')).toThrow();
    expect(() => verifyToken(t + 'x', 'intake')).toThrow();
    expect(() => verifyToken(signToken({ purpose: 'intake' }, -1), 'intake')).toThrow();
  });
  it('CSRF ve bounded stream', async () => {
    process.env.APP_URL = 'http://localhost:3000';
    expect(() =>
      requireOrigin(
        new Request('http://localhost:3000/api', { headers: { origin: 'https://evil.invalid' } }),
      ),
    ).toThrow();
    await expect(
      readBounded(new Request('http://localhost/api', { method: 'POST', body: '12345' }), 4),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('Hassas bilgiler log ve hata yanıtına sızmaz', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await endpoint(async () => {
      throw new Error(JSON.stringify(synthetic));
    });
    safeLog('NOTIFICATION_FAILED');
    expect(JSON.stringify(spy.mock.calls)).not.toContain(synthetic.identityNumber);
    expect(await response.text()).not.toContain(synthetic.name);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
  it('Production yerel adaptör ve eksik anahtarlar kapalı davranır', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => config()).toThrow('LOCAL_MODE_FORBIDDEN');
    vi.stubEnv('APP_MODE', 'supabase');
    vi.stubEnv('DATA_ENCRYPTION_KEY', '');
    expect(() => config()).toThrow();
  });
  it('API hata statüsü korunur', async () => {
    expect(
      (
        await endpoint(async () => {
          throw new HttpError(403, 'DENIED');
        })
      ).status,
    ).toBe(403);
  });
});
describe('Dosya güvenliği', () => {
  it('İkamet PDF toplama kapısı ve zorunluluğu sunucuda uygulanır', async () => {
    const db = await store(),
      intake = randomUUID(),
      id = randomUUID();
    await db.addDocument({
      id,
      application_id: null,
      intake_id: intake,
      kind: 'residence',
      path: `${intake}/${id}.pdf`,
      mime: 'application/pdf',
      size: 100,
      created_at: new Date().toISOString(),
    });
    vi.stubEnv('RESIDENCE_DOCUMENT_ENABLED', 'false');
    await expect(submit(intake, synthetic, [id])).rejects.toMatchObject({ status: 403 });
    vi.stubEnv('RESIDENCE_DOCUMENT_ENABLED', 'true');
    vi.stubEnv('RESIDENCE_DOCUMENT_REQUIRED', 'true');
    await expect(submit(randomUUID(), synthetic, [])).rejects.toMatchObject({ status: 422 });
    const saved = await submit(intake, synthetic, [id]);
    expect(saved.reference).toMatch(/^NF-/);
    const app = await db.byIntake(intake);
    expect((await db.documents(app!.id))[0].kind).toBe('residence');
  });
  it('Boş veya tamamen şeffaf imza reddedilir', async () => {
    const blank = await sharp({
      create: { width: 80, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    await expect(validateFile(blank, 'signature.png', 'image/png', true)).rejects.toMatchObject({
      status: 400,
    });
  });
  it('PNG gerçek decode; uzantı, MIME ve sahte dosya reddi', async () => {
    const png = await sharp({ create: { width: 24, height: 24, channels: 4, background: '#fff' } })
      .png()
      .toBuffer();
    expect((await validateFile(png, 'test.png', 'image/png')).mime).toBe('image/png');
    await expect(validateFile(png, 'test.pdf', 'application/pdf')).rejects.toThrow();
    await expect(validateFile(Buffer.from('fake'), 'test.png', 'image/png')).rejects.toThrow();
    await expect(validateFile(png.subarray(0, 15), 'test.png', 'image/png')).rejects.toThrow();
  });
  it('Dosya boyutu ve imza tür sınırlaması', async () => {
    await expect(
      validateFile(Buffer.alloc(6 * 1024 * 1024), 'a.png', 'image/png'),
    ).rejects.toMatchObject({ status: 413 });
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytes = Buffer.from(await pdf.save());
    expect((await validateFile(bytes, 'a.pdf', 'application/pdf')).mime).toBe('application/pdf');
    await expect(validateFile(bytes, 'a.pdf', 'application/pdf', true)).rejects.toThrow();
  });
});
describe('Kalıcı veri akışı', () => {
  it('Transaction, tekrar gönderim ve outbox benzersizliği', async () => {
    const db = new LocalStore(':memory:');
    const input = {
      id: randomUUID(),
      intake: randomUUID(),
      payload: encrypt(synthetic),
      kind: 'individual',
      masked: maskIdentity(synthetic.identityNumber),
      notice: 'test',
      documents: [],
      receipt: true,
    };
    const a = await db.submit(input);
    const b = await db.submit({ ...input, id: randomUUID() });
    expect(a.reference).toBe(b.reference);
    expect(await db.list({})).toHaveLength(1);
    expect(await db.outbox(a.id)).toHaveLength(2);
    expect((await db.history(a.id))[0].status).toBe('SUBMITTED');
    db.db.close();
  });
  it('Başkasının belgesini bağlama reddi ve rollback', async () => {
    const db = new LocalStore(':memory:');
    await expect(
      db.submit({
        id: randomUUID(),
        intake: randomUUID(),
        payload: 'x',
        kind: 'individual',
        masked: '***',
        notice: 'test',
        documents: [randomUUID()],
        receipt: false,
      }),
    ).rejects.toThrow();
    expect(await db.list({})).toHaveLength(0);
    db.db.close();
  });
  it('Geçerli durum geçişi, not şifreleme ve silme iş akışı', async () => {
    const db = new LocalStore(':memory:');
    const a = await db.submit({
      id: randomUUID(),
      intake: randomUUID(),
      payload: encrypt(synthetic),
      kind: 'individual',
      masked: '***',
      notice: 'test',
      documents: [],
      receipt: false,
    });
    await expect(db.change(a.id, 'admin', 'APPROVED', '')).rejects.toThrow();
    await db.change(a.id, 'admin', 'IN_REVIEW', '');
    await db.change(a.id, 'admin', 'APPROVED', '');
    await db.note(a.id, 'admin', encrypt('Sentetik not'));
    expect((await db.get(a.id))!.status).toBe('APPROVED');
    await expect(db.deletion(a.id, 'admin', true)).rejects.toThrow();
    await db.deletion(a.id, 'admin', false);
    await db.deletion(a.id, 'admin', true);
    expect(await db.get(a.id)).toBeNull();
    expect(await db.outbox(a.id)).toHaveLength(0);
    db.db.close();
  });
  it('Kalıcı rate limit ve aynı anda outbox claim', async () => {
    const db = new LocalStore(':memory:');
    expect(await db.rate('a', 1, 600)).toBe(true);
    expect(await db.rate('a', 1, 600)).toBe(false);
    const a = await db.submit({
      id: randomUUID(),
      intake: randomUUID(),
      payload: 'x',
      kind: 'individual',
      masked: '***',
      notice: 'test',
      documents: [],
      receipt: false,
    });
    const first = await db.claim();
    expect(first).toHaveLength(1);
    expect(await db.claim()).toHaveLength(0);
    await db.finish(first[0].id, 'wrong-lease', true);
    expect((await db.outbox(a.id))[0].state).toBe('processing');
    await db.finish(first[0].id, first[0].lease_until!, false);
    expect((await db.outbox(a.id))[0]).toMatchObject({
      state: 'failed',
      attempts: 1,
      last_error: 'DELIVERY_FAILED',
    });
    db.db.close();
  });
  it('Servis kaydı, bildirim hatası kaydı silmez, tekrar deneme ve hassas olmayan e-posta', async () => {
    const intake = randomUUID();
    const result = await submit(intake, synthetic, []);
    expect(result.reference).toMatch(/^NF-\d{4}-\d{6,}$/);
    expect(await submit(intake, synthetic, [])).toEqual(result);
    const db = await store(),
      a = await db.byIntake(intake);
    const content = notificationContent(a!, 'admin');
    expect(content.text).not.toContain(synthetic.identityNumber);
    expect(content.text).not.toContain(synthetic.name);
    const failing = vi.fn().mockRejectedValue(new Error('synthetic fail'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await processOutbox(failing)).failed).toBeGreaterThan(0);
    expect(await db.get(a!.id)).not.toBeNull();
    const local = db as LocalStore;
    local.db.exec(
      "UPDATE notification_outbox SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE state='failed'",
    );
    const success = vi.fn().mockResolvedValue(undefined);
    expect((await processOutbox(success)).sent).toBeGreaterThan(0);
    expect((await db.outbox(a!.id))[0].state).toBe('sent');
  });
  it('Türkçe PDF fontu, maskeli kimlik ve okunabilir metin', async () => {
    const db = await store(),
      intake = randomUUID();
    await submit(intake, synthetic, []);
    const a = (await db.byIntake(intake))!;
    const bytes = await createApplicationPdf(await detail(a.id));
    mkdirSync('tmp/pdfs', { recursive: true });
    writeFileSync('tmp/pdfs/synthetic-application.pdf', bytes);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(0);
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const p = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const text = (await (await p.getPage(1)).getTextContent()).items
      .map((i) => ('str' in i ? i.str : ''))
      .join(' ');
    expect(text).toContain('Sentetik Çığdem Şen');
    expect(text).toContain('Türkiye');
    expect(text).not.toContain(synthetic.identityNumber);
    await p.cleanup();
  });
});
