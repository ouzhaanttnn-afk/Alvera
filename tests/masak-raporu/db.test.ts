// Veritabanı, RLS ve iş akışı testleri — gerçek PostgreSQL (PGlite) üzerinde, yalnızca sentetik verilerle.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.MASAK_RAPORU_DB = 'memory';
process.env.MASAK_RAPORU_DEMO_PASSWORD = 'Sentetik-Test-Parola-1';

import { ROLE_PERMISSIONS, ROLES } from '@/masak-raporu/permissions';
import { catalogSeedSql } from '@/masak-raporu/rules/catalog';
import { asSystem, asUser } from '@/masak-raporu/server/db';
import { ctxFor, seedDemo } from '@/masak-raporu/server/seed';
import type { Ctx } from '@/masak-raporu/server/session';
import { addIdentityCheck, confirmIdentityCheck, listCustomers } from '@/masak-raporu/server/customers';
import { cancelTransaction, createTransaction, getTransaction, listTransactions } from '@/masak-raporu/server/transactions';
import { listAlerts } from '@/masak-raporu/server/alerts';
import { listCases, submitCase } from '@/masak-raporu/server/cases';
import { readDocument, uploadDocument } from '@/masak-raporu/server/documents';
import { verifyAuditChain } from '@/masak-raporu/server/admin';
import { commitImport, previewImport } from '@/masak-raporu/server/imports';

type Users = Record<'owner' | 'manager' | 'compliance_officer' | 'staff' | 'auditor' | 'other', Ctx>;
let u: Users;
let alveraId: string;
let otherId: string;
const PDF = new TextEncoder().encode('%PDF-1.4\n% sentetik test belgesi\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

beforeAll(async () => {
  await seedDemo();
  const rows = await asSystem((sql) =>
    sql.query<{ email: string; user_id: string; organization_id: string }>(
      `select p.email, m.user_id, m.organization_id from masak.organization_members m join masak.profiles p on p.id = m.user_id`,
    ),
  );
  const find = (e: string) => rows.find((r) => r.email === e)!;
  alveraId = find('sahip@alvera-demo.test').organization_id;
  otherId = find('sahip@ornek-b-demo.test').organization_id;
  const c = async (e: string) => ctxFor(find(e).user_id, find(e).organization_id);
  u = {
    owner: await c('sahip@alvera-demo.test'), manager: await c('yonetici@alvera-demo.test'), compliance_officer: await c('uyum@alvera-demo.test'),
    staff: await c('personel@alvera-demo.test'), auditor: await c('denetci@alvera-demo.test'), other: await c('sahip@ornek-b-demo.test'),
  };
}, 120_000);

describe('Şema ve izin matrisi', () => {
  it('tüm masak tablolarında RLS açık; anon rolü hiçbir tabloya erişemez', async () => {
    const tables = await asSystem((sql) => sql.query<{ tablename: string; rowsecurity: boolean }>(`select tablename, rowsecurity from pg_tables where schemaname = 'masak'`));
    expect(tables.length).toBeGreaterThanOrEqual(26);
    expect(tables.filter((t) => !t.rowsecurity)).toEqual([]);
    await expect(asSystem(async (sql) => { await sql.query('set local role anon'); return sql.query('select * from masak.customers'); })).rejects.toThrow();
  });
  it('veritabanı rol-izin matrisi uygulama matrisiyle aynı', async () => {
    for (const role of ROLES) {
      const r = await asSystem((sql) => sql.query<{ p: string[] }>('select masak.role_permissions($1) as p', [role]));
      expect([...r[0].p].sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });
  it('kural seed migration dosyası kod kataloğuyla aynı', () => {
    expect(readFileSync('supabase/migrations/20261031120100_masak_raporu_rules.sql', 'utf8')).toContain(catalogSeedSql());
  });
});

describe('Test 2 — işletmeler arası izolasyon', () => {
  it('B işletmesi sahibi Alvera kayıtlarını göremez ve değiştiremez', async () => {
    const own = await listCustomers(u.other, {});
    expect(own.every((c) => String(c.display_name).includes('DEMO B'))).toBe(true);
    const leak = await asUser(u.other.user.id, (sql) => sql.query('select id from masak.customers where organization_id = $1', [alveraId]));
    expect(leak).toEqual([]);
    const txLeak = await asUser(u.other.user.id, (sql) => sql.query('select id from masak.transactions where organization_id = $1', [alveraId]));
    expect(txLeak).toEqual([]);
    await expect(
      asUser(u.other.user.id, (sql) => sql.query(`insert into masak.customers (organization_id, kind, display_name, legal_name, created_by) values ($1, 'legal', 'X', 'X', masak.uid())`, [alveraId])),
    ).rejects.toThrow();
    // B bağlamı Alvera müşterisini işlem kaydında kullanamaz (bileşik FK + RLS)
    const alveraCustomer = (await listCustomers(u.owner, {}))[0].id as string;
    await expect(createTransaction(u.other, { occurred_at: '22.10.2026 10:00', customer_id: alveraCustomer, type: 'gold_sale', product_description: 'x x', total: '10', payment_method: 'nakit' })).rejects.toThrow();
  });
});

describe('Test 3 — belge indirme yetkisi', () => {
  let docId: string;
  beforeAll(async () => {
    const customer = (await listCustomers(u.owner, {}))[0].id as string;
    docId = (await uploadDocument(u.staff, { kind: 'fatura', title: 'Sentetik fatura', customer_id: customer }, PDF)).id;
  });
  it('personel ve denetçi hassas belgeyi indiremez; veritabanı fonksiyonu da reddeder', async () => {
    await expect(readDocument(u.staff, docId)).rejects.toThrow('FORBIDDEN');
    await expect(readDocument(u.auditor, docId)).rejects.toThrow('FORBIDDEN');
    await expect(asUser(u.staff.user.id, (sql) => sql.query('select * from masak.authorize_document($1)', [docId]))).rejects.toThrow();
    await expect(asUser(u.staff.user.id, (sql) => sql.query('select * from masak.document_blobs'))).rejects.toThrow();
  });
  it('yetkili indirir; içerik şifre çözülüp bütünlük doğrulanır ve erişim denetim izine yazılır', async () => {
    const d = await readDocument(u.owner, docId);
    expect(Buffer.from(d.data).toString()).toContain('sentetik test belgesi');
    const log = await asSystem((sql) => sql.query(`select 1 from masak.audit_events where action = 'document.download' and entity_id = $1`, [docId]));
    expect(log.length).toBe(1);
  });
  it('içerik türü uzantıdan değil baytlardan belirlenir', async () => {
    const customer = (await listCustomers(u.owner, {}))[0].id as string;
    await expect(uploadDocument(u.staff, { kind: 'fatura', title: 'Sahte pdf', customer_id: customer }, new TextEncoder().encode('<html>not a pdf</html>'))).rejects.toThrow('FILE_TYPE');
  });
});

describe('Test 5 & 14 — veritabanı üzerinden kural motoru', () => {
  it('onaylı bağlantı grubu 228.000 + 165.000 = 393.000 TL olarak değerlendirildi', async () => {
    const alerts = await listAlerts(u.compliance_officer, { status: '' });
    const linked = alerts.filter((a) => a.rule_key === 'KT-BAGLANTILI');
    expect(linked.length).toBe(2);
    expect(String(linked[0].rationale)).toContain('393.000,00 TL');
  });
  it('Eylül 2026 işlemi 185.000 TL (v4), Ekim işlemi 370.000 TL (v5) kuralıyla değerlendirildi', async () => {
    const alerts = await listAlerts(u.owner, { status: '' });
    const single = alerts.filter((a) => a.rule_key === 'KT-ESIK');
    expect(single.map((a) => a.rule_version).sort()).toEqual([4, 5, 5]);
    expect(alerts.some((a) => a.rule_key === 'RG-ESIK-ALTI')).toBe(true);
  });
});

describe('Test 7 & 11 — gizli iç değerlendirme', () => {
  it('personel tutardan bağımsız (işlem seçmeden) iç inceleme açabilir ama listeyi göremez', async () => {
    const number = await submitCase(u.staff, { title: 'Tutardan bağımsız şüphe', reason_category: 'kaynak', description: 'Müşteri fon kaynağını açıklamaktan kaçındı (sentetik).', suspicion_at: '2026-10-30T10:00', transactions: [] });
    expect(number).toMatch(/^INC-\d{4}-\d{6}$/);
    await expect(listCases(u.staff)).rejects.toThrow('FORBIDDEN');
    expect(await asUser(u.staff.user.id, (sql) => sql.query('select * from masak.risk_cases'))).toEqual([]);
    expect(await asUser(u.manager.user.id, (sql) => sql.query('select * from masak.risk_cases'))).toEqual([]);
    expect((await listCases(u.compliance_officer)).length).toBe(2);
  });
  it('ŞİB kaynaklı gizli uyarı yetkisiz kullanıcıya görünmez', async () => {
    const all = await listAlerts(u.compliance_officer, { status: '' });
    expect(all.some((a) => a.rule_key === 'KT-SUPHE' && a.confidential)).toBe(true);
    for (const role of ['staff', 'manager', 'auditor'] as const) {
      const visible = await listAlerts(u[role], { status: '' });
      expect(visible.some((a) => a.confidential)).toBe(false);
    }
    const audit = await asUser(u.manager.user.id, (sql) => sql.query(`select 1 from masak.audit_events where confidential`));
    expect(audit).toEqual([]);
  });
});

describe('Test 8 — iptal/düzeltme denetim izini korur', () => {
  it('iptal edilen işlem silinmez; tutar sonradan değiştirilemez; silme reddedilir', async () => {
    const customer = (await listCustomers(u.staff, { q: 'DEMO Zeynep' }))[0].id as string;
    const t = await createTransaction(u.staff, { occurred_at: '30.10.2026 10:00', customer_id: customer, type: 'jewelry_sale', product_description: 'Sentetik yüzük', total: '1.000,00', payment_method: 'nakit' });
    await expect(asUser(u.owner.user.id, (sql) => sql.query(`update masak.transactions set total_try_kurus = 1 where id = $1`, [t.id]))).rejects.toThrow(/IMMUTABLE/);
    await cancelTransaction(u.staff, t.id, 'Sentetik test: müşteri vazgeçti.');
    await expect(asUser(u.owner.user.id, (sql) => sql.query('delete from masak.transactions where id = $1', [t.id]))).rejects.toThrow();
    await expect(asSystem((sql) => sql.query('delete from masak.transactions where id = $1', [t.id]))).rejects.toThrow(/IMMUTABLE/);
    const detail = await getTransaction(u.owner, t.id);
    expect(detail.transaction.status).toBe('cancelled');
    expect(detail.timeline.map((e) => e.action)).toEqual(['transaction.created', 'transaction.cancelled']);
    expect(detail.versions.map((v) => v.status)).toEqual(['completed', 'cancelled']);
  });
  it('düzeltilen demo işlemi ve yeni kaydı birlikte korunur', async () => {
    const rows = await listTransactions(u.owner, { q: '' });
    expect(rows.some((r) => r.status === 'superseded')).toBe(true);
  });
  it('denetim izi hash zinciri doğrulanır', async () => {
    const r = await verifyAuditChain(u.owner);
    expect(r.total).toBeGreaterThan(20);
    expect(r.broken).toBe(0);
  });
});

describe('Test 9 — OCR sonucu onaysız teyit sayılmaz', () => {
  it('OCR kaydı onaysız beklemede kalır; veritabanı onaysız doğrulamayı reddeder', async () => {
    const customer = (await listCustomers(u.staff, { q: 'DEMO Mehmet' }))[0].id as string;
    const check = await addIdentityCheck(u.staff, customer, { method: 'ocr_destekli', document_type: 'tc_kimlik_karti', ocr_used: 'true' });
    expect(check.status).toBe('pending');
    await expect(asUser(u.staff.user.id, (sql) => sql.query(`update masak.customer_identity_checks set status = 'verified', confirmed_by = masak.uid(), confirmed_at = now() where id = $1`, [check.id]))).rejects.toThrow(/check constraint/);
    await expect(confirmIdentityCheck(u.staff, check.id, false)).rejects.toThrow('OCR_NOT_CONFIRMED');
    await confirmIdentityCheck(u.staff, check.id, true);
    const v = await asSystem((sql) => sql.query<{ status: string; ocr_confirmed: boolean }>('select status, ocr_confirmed from masak.customer_identity_checks where id = $1', [check.id]));
    expect(v[0]).toEqual({ status: 'verified', ocr_confirmed: true });
  });
});

describe('Test 12 — CSV içe aktarma (veritabanıyla)', () => {
  it('kayıtlı müşteri eşleşir; bilinmeyen müşteri, mükerrer ve hatalı satır ayrıştırılır', async () => {
    const identity = (await asSystem((sql) => sql.query<{ id: string }>(`select id from masak.customers where display_name = 'DEMO Ayşe Örnek'`)))[0];
    const detail = await (await import('@/masak-raporu/server/customers')).getCustomer(u.owner, identity.id, true);
    const tckn = detail.revealed!.identity!;
    const csv = `Tarih;Kimlik;Tür;Ürün;Toplam;Ödeme;Fiş\n30.10.2026 09:00;${tckn};Altın satışı;Sentetik bilezik;12.000,00;nakit;CSV-1\n30.10.2026 09:00;${tckn};Altın satışı;Sentetik bilezik;12.000,00;nakit;CSV-1\n30.10.2026 09:30;99999999990;Altın satışı;Bilinmeyen;1.000,00;nakit;CSV-2\n31.10.2026;${tckn};bitcoin;x;abc;nakit;CSV-3\n`;
    const mapping = { occurred_at: 0, customer_identifier: 1, type: 2, product_description: 3, total: 4, payment_method: 5, invoice_reference: 6 };
    const p = await previewImport(u.staff, csv, mapping);
    expect(p.valid.map((r) => r.line)).toEqual([2]);
    expect(p.duplicates.map((d) => d.line)).toEqual([3]);
    expect(p.errors.map((e) => e.line)).toEqual(expect.arrayContaining([4, 5]));
    expect((await commitImport(u.staff, csv, mapping)).imported).toBe(1);
    const again = await previewImport(u.staff, csv, mapping);
    expect(again.valid).toEqual([]);
    expect(again.duplicates.map((d) => d.line)).toEqual([2, 3]);
  });
});

export { otherId };
