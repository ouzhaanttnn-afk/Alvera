// Rapor ve denetim paketi testleri — sentetik demo verisi üzerinde.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.MASAK_RAPORU_DB = 'memory';
process.env.MASAK_RAPORU_DEMO_PASSWORD = 'Sentetik-Test-Parola-1';

import { asSystem, asUser } from '@/masak-raporu/server/db';
import { ctxFor, seedDemo } from '@/masak-raporu/server/seed';
import type { Ctx } from '@/masak-raporu/server/session';
import { exportCsv, generateReport, REPORTS, type ReportCode } from '@/masak-raporu/server/reports';
import { auditPackage } from '@/masak-raporu/server/audit-package';
import { getCustomer } from '@/masak-raporu/server/customers';

let u: Record<'owner' | 'manager' | 'compliance_officer' | 'staff' | 'auditor', Ctx>;

async function pdfText(bytes: Uint8Array) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n';
  await doc.cleanup();
  return text;
}

beforeAll(async () => {
  await seedDemo();
  const rows = await asSystem((sql) => sql.query<{ email: string; user_id: string; organization_id: string }>(
    `select p.email, m.user_id, m.organization_id from masak.organization_members m join masak.profiles p on p.id = m.user_id`));
  const c = (e: string) => { const r = rows.find((x) => x.email === e)!; return ctxFor(r.user_id, r.organization_id); };
  u = { owner: await c('sahip@alvera-demo.test'), manager: await c('yonetici@alvera-demo.test'), compliance_officer: await c('uyum@alvera-demo.test'), staff: await c('personel@alvera-demo.test'), auditor: await c('denetci@alvera-demo.test') };
}, 120_000);

describe('Test 10 — PDF içerik ve referanslar', () => {
  it('işlem detay raporu doğru işlem, müşteri ve rapor referansını içerir; uyarı metni vardır', async () => {
    const tx = (await asSystem((sql) => sql.query<{ id: string; number: string }>(`select id, number from masak.transactions where product_description = 'DEMO 22 ayar set'`)))[0];
    const r = await generateReport(u.owner, 'B', { transaction: tx.id });
    expect(r.reference).toMatch(/^RPR-\d{4}-\d{6}$/);
    mkdirSync('tmp/pdfs', { recursive: true });
    writeFileSync('tmp/pdfs/masak-raporu-B.pdf', r.bytes);
    const text = await pdfText(r.bytes);
    expect(text).toContain(tx.number);
    expect(text).toContain('DEMO Ayşe Örnek');
    expect(text).toContain(r.reference);
    expect(text).toContain('resmi MASAK bildirim belgesi değildir');
    expect(text).toContain('410.000,00 TL');
    expect(text).toMatch(/Sayfa 1 \/ \d/);
    const saved = await asSystem((sql) => sql.query<{ sha256: string; record_versions: { id: string }[] }>('select sha256, record_versions from masak.report_exports where reference = $1', [r.reference]));
    expect(saved[0].sha256).toBe(r.sha256);
    expect(saved[0].record_versions[0].id).toBe(tx.id);
  });
  it('müşteri raporu kimlik numarasını maskeler; açık hali yalnızca yetkili ve açık taleple', async () => {
    const id = (await asSystem((sql) => sql.query<{ id: string }>(`select id from masak.customers where display_name = 'DEMO Ayşe Örnek'`)))[0].id;
    const full = (await getCustomer(u.owner, id, true)).revealed!.identity!;
    const masked = await pdfText((await generateReport(u.auditor, 'A', { customer: id })).bytes);
    expect(masked).not.toContain(full);
    expect(masked).toContain('Doğrulandı');
    await expect(generateReport(u.auditor, 'A', { customer: id, unmasked: true })).rejects.toThrow('FORBIDDEN');
    expect(await pdfText((await generateReport(u.owner, 'A', { customer: id, unmasked: true })).bytes)).toContain(full);
  });
  it('tüm rapor türleri yetkili kullanıcı için üretilir', async () => {
    for (const code of Object.keys(REPORTS) as ReportCode[]) {
      if (code === 'B') continue;
      const r = await generateReport(u.owner, code, { from: '2026-09-01', to: '2026-10-31', date: '2026-10-20', month: '2026-10' });
      expect((await pdfText(r.bytes)).length).toBeGreaterThan(200);
    }
  });
});

describe('Test 13 — gizli raporlar yetkisiz kişiye kapalı', () => {
  it('H raporu yalnızca gizli rapor ve inceleme yetkisi olanlarca üretilir', async () => {
    for (const role of ['staff', 'manager', 'auditor'] as const) await expect(generateReport(u[role], 'H', { from: '2026-10-01', to: '2026-10-31' })).rejects.toThrow('FORBIDDEN');
    const ok = await generateReport(u.compliance_officer, 'H', { from: '2026-10-01', to: '2026-10-31' });
    expect(await pdfText(ok.bytes)).toContain('GİZLİ');
  });
  it('veritabanı da yetkisiz gizli dışa aktarma kaydını reddeder', async () => {
    await expect(asUser(u.manager.user.id, (sql) => sql.query(
      `insert into masak.report_exports (organization_id, report_type, format, reference, confidential, created_by) values ($1, 'H', 'pdf', 'X-1', true, masak.uid())`, [u.manager.org.organizationId]))).rejects.toThrow();
    const visible = await asUser(u.manager.user.id, (sql) => sql.query('select 1 from masak.report_exports where confidential'));
    expect(visible).toEqual([]);
  });
  it('personel CSV dışa aktaramaz; denetim paketinde gizli içerik yalnızca yetkiliye', async () => {
    await expect(exportCsv(u.staff, 'transactions', {})).rejects.toThrow('FORBIDDEN');
    await expect(auditPackage(u.manager, { from: '2026-10-01', to: '2026-10-31', include_confidential: true })).rejects.toThrow('FORBIDDEN');
    const plain = await auditPackage(u.manager, { from: '2026-10-01', to: '2026-10-31' });
    expect(plain.manifest.reports.map((r) => r.code)).not.toContain('H');
    expect(Buffer.from(plain.zip).toString('latin1')).not.toContain('Eşik altı tekrarlayan');
  });
});

describe('Denetim hazırlık ZIP paketi', () => {
  it('geçerli ZIP, manifest özetleri ve belge kopyaları ile üretilir', async () => {
    const p = await auditPackage(u.compliance_officer, { from: '2026-09-01', to: '2026-10-31', include_documents: true, include_confidential: true });
    mkdirSync('tmp/zips', { recursive: true });
    writeFileSync('tmp/zips/denetim.zip', p.zip);
    const listing = execFileSync('unzip', ['-l', 'tmp/zips/denetim.zip']).toString();
    expect(execFileSync('unzip', ['-tq', 'tmp/zips/denetim.zip']).toString()).toMatch(/No errors/);
    for (const f of ['manifest.json', 'manifest.sha256', 'BENIOKU.txt', 'veriler/islemler.csv', 'veriler/kayit-degisiklikleri.csv'])
      expect(listing).toContain(f);
    expect(p.manifest.reports.map((r) => r.code).sort()).toEqual(['A', 'E', 'F', 'G', 'H', 'I']);
    const manifest = execFileSync('unzip', ['-p', 'tmp/zips/denetim.zip', 'manifest.json']).toString();
    const csv = execFileSync('unzip', ['-p', 'tmp/zips/denetim.zip', 'veriler/islemler.csv']);
    const { createHash } = await import('node:crypto');
    expect(JSON.parse(manifest).files.find((f: { path: string }) => f.path === 'veriler/islemler.csv').sha256).toBe(createHash('sha256').update(csv).digest('hex'));
    expect(createHash('sha256').update(manifest).digest('hex')).toBe(p.manifestHash);
  });
});
