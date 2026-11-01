import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Role } from '../permissions';
import { createLocalUser } from './auth';
import { submitCase, updateCase } from './cases';
import { raporConfig } from './config';
import { addIdentityCheck, addPerson, createCustomer } from './customers';
import { asSystem } from './db';
import { buildCtx, memberships, type Ctx } from './session';
import { newTotpSecret } from './totp';
import { cancelTransaction, correctTransaction, createTransaction, decideLinkGroup, proposeLinkGroup } from './transactions';

/** Sağlama algoritmasını geçen ama gerçek bir kişiye ait OLMAYAN sentetik T.C. kimlik numarası (999 ile başlar). */
export function syntheticTckn(): string {
  const d = [9, 9, 9, ...Array.from({ length: 6 }, () => randomInt(10))];
  const d10 = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  const d11 = [...d, d10].reduce((a, b) => a + b, 0) % 10;
  return [...d, d10, d11].join('');
}

/** Sağlama algoritmasını geçen sentetik vergi kimlik numarası (999 ile başlar). */
export function syntheticVkn(): string {
  const d = [9, 9, 9, ...Array.from({ length: 6 }, () => randomInt(10))];
  const sum = d.reduce((acc, digit, i) => {
    const a = (digit + 9 - i) % 10;
    const b = (a * 2 ** (9 - i)) % 9;
    return acc + (a === 0 ? 0 : b === 0 ? 9 : b);
  }, 0);
  return [...d, (10 - (sum % 10)) % 10].join('');
}

export async function createOrganization(name: string, isDemo: boolean) {
  return asSystem(async (sql) => {
    const r = await sql.query<{ id: string }>('insert into masak.organizations (name, is_demo) values ($1, $2) returning id', [name, isDemo]);
    const id = r[0].id;
    await sql.query(
      `insert into masak.data_retention_policies (organization_id, entity_type, retention_years, basis) values
        ($1, 'customers', 8, '5549 s. Kanun md. 8: kimlik tespitine ilişkin belgelerde son işlem tarihinden itibaren 8 yıl — hukuki doğrulama gerekiyor'),
        ($1, 'transactions', 8, '5549 s. Kanun md. 8: düzenleme/son kayıt tarihinden itibaren 8 yıl — hukuki doğrulama gerekiyor'),
        ($1, 'documents', 8, '5549 s. Kanun md. 8; Tedbirler Yön. md. 46 — hukuki doğrulama gerekiyor'),
        ($1, 'risk_cases', 8, 'Tedbirler Yön. md. 46/2: ŞİB, iç bildirim ve bildirmeme gerekçeleri saklanır — hukuki doğrulama gerekiyor'),
        ($1, 'audit_events', 8, 'İç denetim ve ispat amacıyla — hukuki doğrulama gerekiyor'),
        ($1, 'reports', 8, 'İç denetim ve ispat amacıyla — hukuki doğrulama gerekiyor')`,
      [id],
    );
    return id;
  });
}

export async function addMemberSystem(organizationId: string, userId: string, role: Role) {
  await asSystem((sql) => sql.query('insert into masak.organization_members (organization_id, user_id, role) values ($1, $2, $3)', [organizationId, userId, role]));
}

export async function ctxFor(userId: string, orgId: string): Promise<Ctx> {
  const rows = await asSystem((sql) => sql.query<{ email: string; full_name: string }>('select email, full_name from masak.profiles where id = $1', [userId]));
  return buildCtx({ id: userId, email: rows[0].email, fullName: rows[0].full_name }, await memberships(userId), orgId)!;
}

const DEMO_USERS: [string, string, Role][] = [
  ['sahip@alvera-demo.test', 'Demo İşletme Sahibi', 'owner'],
  ['yonetici@alvera-demo.test', 'Demo Yönetici', 'manager'],
  ['uyum@alvera-demo.test', 'Demo Uyum Yetkilisi', 'compliance_officer'],
  ['personel@alvera-demo.test', 'Demo Personel', 'staff'],
  ['denetci@alvera-demo.test', 'Demo Denetçi', 'auditor'],
];

const g = globalThis as unknown as { __masakDemo?: Promise<void> };

/** Yerel ortamda veritabanı boşsa açıkça "DEMO" etiketli sentetik veri oluşturur. Üretimde çalışmaz. */
export function ensureLocalDemo() {
  if (!raporConfig().local || process.env.MASAK_RAPORU_DEMO_SEED === 'false') return Promise.resolve();
  return (g.__masakDemo ||= (async () => {
    const exists = await asSystem((sql) => sql.query('select 1 from masak.organizations limit 1'));
    if (exists.length) return;
    await seedDemo();
  })().catch((e) => {
    g.__masakDemo = undefined;
    throw e;
  }));
}

export async function seedDemo() {
  const password = process.env.MASAK_RAPORU_DEMO_PASSWORD || `Demo-${randomBytes(9).toString('base64url')}9a`;
  const totp = process.env.MASAK_RAPORU_DEMO_TOTP_SECRET || newTotpSecret();
  const alvera = await createOrganization('Alvera Kuyumculuk (DEMO)', true);
  const other = await createOrganization('Örnek Kuyumcu B (DEMO)', true);
  const ids: Record<string, string> = {};
  for (const [email, name, role] of DEMO_USERS) {
    ids[role] = await asSystem((sql) => createLocalUser(sql, email, name, password, totp));
    await addMemberSystem(alvera, ids[role], role);
  }
  const otherOwner = await asSystem((sql) => createLocalUser(sql, 'sahip@ornek-b-demo.test', 'Demo B Sahibi', password, totp));
  await addMemberSystem(other, otherOwner, 'owner');

  const staff = await ctxFor(ids.staff, alvera);
  const compliance = await ctxFor(ids.compliance_officer, alvera);
  const person = (first: string, last: string, extra: Record<string, unknown> = {}) => ({
    kind: 'natural', first_name: first, last_name: last, nationality: 'Türkiye', identity_type: 'tc_kimlik_karti', identity_number: syntheticTckn(),
    birth_date: '1985-05-12', address: 'DEMO Mah. Sentetik Sok. No:1 Mamak/Ankara', phone: '0500 000 00 00', occupation: 'Öğretmen', ...extra,
  });
  const ayse = (await createCustomer(staff, person('DEMO Ayşe', 'Örnek'), true)).id!;
  const mehmet = (await createCustomer(staff, person('DEMO Mehmet', 'Sentetik', { address: '', occupation: '' }), true)).id!;
  const zeynep = (await createCustomer(staff, person('DEMO Zeynep', 'Deneme', { continuous_relationship: 'true' }), true)).id!;
  const firma = (await createCustomer(staff, {
    kind: 'legal', legal_name: 'DEMO Örnek Ticaret A.Ş.', tax_office: 'Çankaya', tax_number: syntheticVkn(),
    trade_registry_number: 'DEMO-12345', activity: 'Toptan ticaret (sentetik)', address: 'DEMO Cad. No:5 Çankaya/Ankara', phone: '0312 000 00 00',
  }, true)).id!;
  await addPerson(staff, firma, 'representative', { full_name: 'DEMO Ali Temsilci', relation: 'yetkili_temsilci', identity_number: syntheticTckn(), nationality: 'Türkiye', authority_document: 'İmza sirküleri (sentetik)' });
  await addPerson(staff, firma, 'owner', { full_name: 'DEMO Elif Ortak', identity_number: syntheticTckn(), nationality: 'Türkiye', ownership_percent: '60', control_description: '%25 üzeri pay (sentetik)' });
  await addIdentityCheck(staff, ayse, { method: 'belge_inceleme', document_type: 'tc_kimlik_karti', confirm: 'true', notes: 'DEMO: belge aslı incelendi.' });
  await addIdentityCheck(staff, firma, { method: 'ocr_destekli', document_type: 'tc_kimlik_karti', ocr_used: 'true', notes: 'DEMO: OCR sonucu henüz onaylanmadı.' });

  const tx = (customer: string, at: string, type: string, total: string, payment: string, product: string, extra: Record<string, unknown> = {}) =>
    createTransaction(staff, { occurred_at: at, customer_id: customer, type, product_description: product, total, payment_method: payment, karat: '22', quantity: '1', ...extra }, { isDemo: true });
  await tx(ayse, '15.09.2026 11:00', 'gold_sale', '200.000,00', 'banka_karti', 'DEMO 22 ayar bilezik (eski eşik dönemi)');
  await tx(ayse, '08.10.2026 14:30', 'gold_sale', '410.000,00', 'banka_karti', 'DEMO 22 ayar set');
  const a = await tx(mehmet, '20.10.2026 10:15', 'gold_sale', '228.000,00', 'nakit', 'DEMO çeyrek altın');
  const b = await tx(mehmet, '21.10.2026 16:40', 'gold_sale', '165.000,00', 'nakit', 'DEMO yarım altın');
  await tx(mehmet, '24.10.2026 12:00', 'bullion', '330.000,00', 'nakit', 'DEMO gram altın');
  const d = await tx(mehmet, '26.10.2026 12:20', 'bullion', '340.000,00', 'nakit', 'DEMO gram altın');
  await tx(firma, '15.10.2026 09:30', 'bullion', '1.250.000,00', 'havale_eft', 'DEMO 1 kg külçe', { karat: '24', weight_grams: '1000', representative_id: '' });
  await tx(zeynep, '27.10.2026 15:00', 'jewelry_sale', '12.500,00', 'kredi_karti', 'DEMO pırlanta küpe', { karat: '14' });
  const wrong = await tx(zeynep, '28.10.2026 11:00', 'gold_purchase', '45.000,00', 'nakit', 'DEMO hatalı tutar girilmiş alış');
  await correctTransaction(staff, wrong.id, { occurred_at: '28.10.2026 11:00', customer_id: zeynep, type: 'gold_purchase', product_description: 'DEMO düzeltilmiş alış', total: '54.000,00', payment_method: 'nakit', karat: '22', quantity: '1' }, 'DEMO: tutar fişte 54.000 TL, yanlış girilmişti.');
  const cancelled = await tx(ayse, '29.10.2026 13:00', 'gold_sale', '25.000,00', 'nakit', 'DEMO iptal edilen satış');
  await cancelTransaction(staff, cancelled.id, 'DEMO: müşteri satın almaktan vazgeçti, ürün iade edilmedi.');

  const group = await proposeLinkGroup(staff, [a.id, b.id], ['ayni_musteri', 'zaman_yakinligi'], 'DEMO: Aynı müşteri art arda iki gün nakit alım yaptı; tek alışverişin bölündüğünü söyledi.');
  await decideLinkGroup(compliance, group, 'confirmed', 'DEMO: Müşteri beyanı ve fişlere göre tek alışverişin parçaları; bağlantılı kabul edildi.');
  const caseNumber = await submitCase(staff, {
    title: 'DEMO: Eşik altı tekrarlayan nakit alımlar', reason_category: 'bolme',
    description: 'DEMO: Müşteri kısa sürede eşiğin hemen altında nakit alımlar yaptı ve kimlik bilgisi vermekte isteksizdi.',
    suspicion_at: '2026-10-26T12:30', transactions: [d.id],
  });
  const caseRow = await compliance.db((sql) => sql.query<{ id: string }>('select id from masak.risk_cases where number = $1', [caseNumber]));
  await updateCase(compliance, caseRow[0].id, { status: 'investigating', assigned_to: ids.compliance_officer, note: 'DEMO: İnceleme başlatıldı; müşteri işlemleri ve ödeme kaynakları değerlendiriliyor.' });

  const otherCtx = await ctxFor(otherOwner, other);
  const bCustomer = (await createCustomer(otherCtx, person('DEMO B', 'Müşterisi'), true)).id!;
  await createTransaction(otherCtx, { occurred_at: '22.10.2026 10:00', customer_id: bCustomer, type: 'gold_sale', product_description: 'DEMO B işletmesi satışı', total: '50.000,00', payment_method: 'nakit' }, { isDemo: true });

  const dir = raporConfig().dataDir;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'masak-raporu-demo-giris.txt'),
    [
      'ALVERA MASAK RAPORU — YEREL DEMO GİRİŞ BİLGİLERİ (yalnızca sentetik veri; Git ile paylaşmayın)',
      `Parola (tüm demo kullanıcıları): ${password}`,
      `TOTP gizli anahtarı (doğrulayıcı uygulamaya ekleyin): ${totp}`,
      ...DEMO_USERS.map(([e, , r]) => `${r.padEnd(20)} ${e}`),
      `owner (B işletmesi)  sahip@ornek-b-demo.test`,
    ].join('\n') + '\n',
    { mode: 0o600 },
  );
}
