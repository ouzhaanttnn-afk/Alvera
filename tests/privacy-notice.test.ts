// Aydınlatma metni: yasal asgari içerik, formun gerçek veri alanlarıyla tutarlılık ve taslakla yayına çıkılmasının engellenmesi.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/lib/config';

const root = join(__dirname, '..');
const draft = readFileSync(join(root, 'legal/aydinlatma-metni.txt'), 'utf8');
const types = readFileSync(join(root, 'src/lib/types.ts'), 'utf8');
afterEach(() => vi.unstubAllEnvs());

describe('Aydınlatma metni içeriği', () => {
  it('Tebliğ’in asgari dört unsurunu ve KVKK md. 11 atfını taşır', () => {
    for (const heading of ['1. VERİ SORUMLUSU', '3. İŞLEME AMAÇLARI', 'KİMLERE VE HANGİ AMAÇLA AKTARILDIĞI', 'VERİLERİN TOPLANMA YÖNTEMİ', '4. HUKUKİ SEBEPLER', '8. HAKLARINIZ'])
      expect(draft, heading).toContain(heading);
    expect(draft).toContain('KVKK\'nın 11. maddesi kapsamındaki haklarınızı');
    expect(draft).toMatch(/5\. maddesinin 2\. fıkrasındaki/);
    for (const bent of ['bent a', 'bent ç', 'bent c', 'bent e', 'bent f']) expect(draft, bent).toContain(bent); // genel atıf değil, somut bentler
  });

  it('açık rıza istemez ve onay dili kullanmaz (Kurul 2026/347 ilke kararı)', () => {
    expect(draft).toContain('açık rızanıza dayanılarak işlenmez');
    expect(draft).not.toMatch(/kabul ediyorum|onaylıyorum|onay veriyorum|rıza veriyorum/i);
  });

  it('formun topladığı her alanı kapsar: forma yeni alan eklenirse metin güncellenmeden test geçmez', () => {
    const block = types.match(/export type ApplicationData = \{([\s\S]*?)\};/)![1];
    const fields = [...block.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    const mention: Record<string, string> = {
      kind: 'başvuru türü', identityNumber: 'kimlik numarası', identityType: 'kimlik belgesi türü', name: 'ad soyad', province: 'il, ilçe, mahalle',
      district: 'il, ilçe, mahalle', neighborhood: 'il, ilçe, mahalle', phone: 'cep telefonu', email: 'e-posta adresi', address: 'açık adres',
      nationality: 'uyruk', occupation: 'meslek', amount: 'tutarı', noticeRead: 'okuduğunuza dair beyan',
    };
    for (const field of fields) {
      expect(mention[field], `"${field}" alanı için metinde karşılık tanımlı değil; aydınlatma metnini ve bu tabloyu güncelleyin`).toBeTruthy();
      expect(draft, field).toContain(mention[field]);
    }
  });

  it('iletişim bilgileri sitedeki gerçek bilgilerle aynıdır', async () => {
    // @ts-ignore tip bildirimi olmayan düz JavaScript modülü
    const { defaults } = await import('../lib/catalog.js');
    expect(draft).toContain(defaults.settings.address);
    expect(draft).toContain(defaults.settings.phone);
  });

  it('bilinmeyen her bilgi görünür bir doldurma işaretiyle bırakılmıştır, uydurulmamıştır', () => {
    const marks = draft.match(/\[\[[\s\S]*?\]\]/g) || [];
    expect(marks.length).toBeGreaterThanOrEqual(5);
    for (const mark of marks) expect(mark.startsWith('[[DOLDURUN:'), mark).toBe(true);
  });
});

describe('Taslakla yayına çıkış engeli', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  function production(noticePath: string) {
    const env: Record<string, string> = {
      APP_MODE: 'supabase', APP_URL: 'https://form.example.invalid', DATA_ENCRYPTION_KEY: key, TOKEN_SECRET: key, CRON_SECRET: key,
      SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', RESEND_API_KEY: 'r', EMAIL_FROM: 'a@example.invalid',
      ADMIN_EMAIL: 'b@example.invalid', TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret', PRIVACY_NOTICE_PATH: noticePath,
      PRIVACY_NOTICE_VERSION: 'test-v1', DATA_CONTROLLER_NAME: 'Test', MASAK_INTAKE_ENABLED: 'true', LEGAL_REVIEW_APPROVED: 'true',
      DOCUMENTS_ENABLED: 'false', SIGNATURE_ENABLED: 'false', RESIDENCE_DOCUMENT_ENABLED: 'false',
    };
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  }

  it('doldurulmamış taslak varken başvuru kabul edilmez, doldurulunca edilir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alvera-notice-'));
    try {
      production(join(root, 'legal/aydinlatma-metni.txt'));
      expect(() => config()).toThrow('PRIVACY_NOTICE_INCOMPLETE');

      const filled = join(dir, 'tam.txt');
      writeFileSync(filled, draft.replace(/\[\[DOLDURUN:[\s\S]*?\]\]/g, 'Örnek değer'));
      production(filled);
      expect(() => config()).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hukuki onay bayrağı olmadan, metin tam olsa bile açılmaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alvera-notice-'));
    try {
      const filled = join(dir, 'tam.txt');
      writeFileSync(filled, draft.replace(/\[\[DOLDURUN:[\s\S]*?\]\]/g, 'Örnek değer'));
      production(filled);
      vi.stubEnv('LEGAL_REVIEW_APPROVED', 'false');
      expect(() => config()).toThrow('PRODUCTION_REVIEW_REQUIRED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
