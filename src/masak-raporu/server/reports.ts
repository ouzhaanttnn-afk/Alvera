import 'server-only';
import { z } from 'zod';
import { toCsv } from '../csv';
import { formatDate, formatDateTime, istanbulDate } from '../dates';
import { formatKurus } from '../money';
import { LEVEL_LABELS } from '../rules/engine';
import { ROLE_LABELS, type Permission, type Role } from '../permissions';
import { ACTION_LABELS, audit } from './audit';
import { CASE_STATUS, REASONS } from './cases';
import type { Sql } from './db';
import { AppError, forbidden } from './errors';
import { decryptField, sha256 } from './keys';
import { renderPdf, type Section } from './pdf';
import type { Ctx } from './session';
import { PAYMENT_METHODS, TX_STATUS, TX_TYPES } from './transactions';
import { verifyAuditChain } from './admin';

export type ReportCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';
type Filter = 'range' | 'date' | 'month' | 'customer' | 'transaction' | 'type' | 'status';

export const REPORTS: Record<ReportCode, { title: string; description: string; filters: Filter[]; perms: Permission[]; confidential: boolean }> = {
  A: { title: 'Müşteri Kimlik Tespit ve Teyit Kayıt Özeti', description: 'Müşterilerin kimlik bilgileri (maskeli), teyit kayıtları ve eksik alanlar.', filters: ['range', 'customer'], perms: ['export.data'], confidential: false },
  B: { title: 'İşlem Detay Raporu', description: 'Tek işlemin tüm alanları, kural değerlendirmeleri, bağlantıları ve zaman çizelgesi.', filters: ['transaction'], perms: ['export.data'], confidential: false },
  C: { title: 'Günlük İşlem Dökümü', description: 'Seçilen günün tüm işlemleri ve toplamları.', filters: ['date', 'type', 'status'], perms: ['export.data'], confidential: false },
  D: { title: 'Aylık İşlem Raporu', description: 'Ay içindeki işlemlerin türe göre dağılımı, günlük toplamlar ve kimlik tespiti gerektiren işlemler.', filters: ['month', 'type'], perms: ['export.data'], confidential: false },
  E: { title: 'Eksik Evrak ve Kontrol Raporu', description: 'Teyit kaydı eksik işlemler, onay bekleyen OCR kayıtları ve açık uyarılar.', filters: ['range'], perms: ['export.data'], confidential: false },
  F: { title: 'Bağlantılı İşlem Değerlendirme Raporu', description: 'Bağlantı önerileri, kararları, gerekçeleri ve toplam tutarları.', filters: ['range'], perms: ['export.data'], confidential: false },
  G: { title: 'Denetim Hazırlık Raporu', description: 'Dönem özeti, uygulanan kural versiyonları, açık maddeler ve denetim izi bütünlüğü.', filters: ['range'], perms: ['export.data'], confidential: false },
  H: { title: 'Dahili Risk İnceleme Raporu', description: 'Gizli iç şüphe değerlendirmeleri ve karar geçmişi. Yalnızca yetkili roller.', filters: ['range'], perms: ['export.data', 'reports.confidential', 'cases.view'], confidential: true },
  I: { title: 'Yetki ve İşlem Geçmişi Raporu', description: 'Personel, roller, izin değişiklikleri ve denetim izi kayıtları.', filters: ['range'], perms: ['export.data', 'audit.view'], confidential: false },
};

export const paramsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  customer: z.string().uuid().optional(),
  transaction: z.string().uuid().optional(),
  type: z.string().max(40).optional(),
  status: z.string().max(20).optional(),
  unmasked: z.boolean().optional(),
});
export type ReportParams = z.infer<typeof paramsSchema>;

export function canGenerate(ctx: Ctx, code: ReportCode) {
  return REPORTS[code].perms.every((p) => ctx.can(p));
}

type Version = { entity: string; id: string; version: number };
const fmt = (k: unknown) => formatKurus(String(k ?? '0'));
const label = <T extends Record<string, string>>(map: T, v: unknown) => map[String(v) as keyof T] || String(v ?? '—');

function rangeOf(p: ReportParams): [string, string] {
  if (p.month) {
    const [y, m] = p.month.split('-').map(Number);
    return [`${p.month}-01`, istanbulDate(new Date(Date.UTC(y, m, 0, 12)))];
  }
  if (p.date) return [p.date, p.date];
  const to = p.to || istanbulDate(new Date());
  const from = p.from || `${to.slice(0, 8)}01`;
  if (from > to) throw new AppError('INVALID_RANGE', 'Başlangıç tarihi bitiş tarihinden sonra olamaz.');
  return [from, to];
}
const RANGE_SQL = (col: string) => `${col} >= ($2 || 'T00:00:00+03:00')::timestamptz and ${col} < (($3 || 'T00:00:00+03:00')::timestamptz + interval '1 day')`;

async function identityText(ctx: Ctx, row: Record<string, unknown>, p: ReportParams) {
  if (p.unmasked && ctx.can('sensitive.view')) {
    if (row.identity_number_enc) return decryptField(String(row.identity_number_enc), `customer:identity:${ctx.org.organizationId}`);
    if (row.tax_number_enc) return decryptField(String(row.tax_number_enc), `customer:tax:${ctx.org.organizationId}`);
  }
  return String(row.identity_masked || row.tax_masked || '—');
}

async function build(ctx: Ctx, sql: Sql, code: ReportCode, p: ReportParams): Promise<{ sections: Section[]; scope: [string, string][]; versions: Version[]; count: number }> {
  const org = ctx.org.organizationId;
  const [from, to] = rangeOf(p);
  const versions: Version[] = [];
  const scope: [string, string][] = [];
  const sections: Section[] = [];
  const txCols: { key: string; label: string; width: number; align?: 'right' }[] = [
    { key: 'number', label: 'İşlem no', width: 14 }, { key: 'time', label: 'Tarih/saat', width: 14 }, { key: 'customer', label: 'Müşteri', width: 18 },
    { key: 'type', label: 'Tür', width: 13 }, { key: 'total', label: 'Tutar (TL)', width: 14, align: 'right' }, { key: 'payment', label: 'Ödeme', width: 10 },
    { key: 'status', label: 'Durum', width: 9 }, { key: 'alert', label: 'Uyarı', width: 8 },
  ];
  const txRows = async (where: string, params: unknown[]) => {
    const rows = await sql.query<Record<string, unknown>>(
      `select t.id, t.version, t.number, t.occurred_at, t.type, t.total_try_kurus::text as total, t.payment_method, t.status, c.display_name,
              (select max(a.level) filter (where a.level = 'high') from masak.compliance_alerts a where a.transaction_id = t.id and a.status = 'open') as high,
              (select count(*)::int from masak.compliance_alerts a where a.transaction_id = t.id and a.status = 'open') as open_alerts
         from masak.transactions t join masak.customers c on c.id = t.customer_id where t.organization_id = $1 and ${where} order by t.occurred_at`,
      [org, ...params],
    );
    rows.forEach((r) => versions.push({ entity: 'transactions', id: String(r.id), version: Number(r.version) }));
    return rows;
  };
  const txTable = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      number: String(r.number), time: formatDateTime(r.occurred_at as Date), customer: String(r.display_name), type: label(TX_TYPES, r.type),
      total: fmt(r.total).replace(' TL', ''), payment: label(PAYMENT_METHODS, r.payment_method), status: label(TX_STATUS, r.status),
      alert: r.high ? 'Yüksek' : Number(r.open_alerts) ? String(r.open_alerts) : '—',
    }));
  const totals = (rows: Record<string, unknown>[]): [string, string][] => {
    const done = rows.filter((r) => r.status === 'completed');
    return [
      ['İşlem sayısı (tamamlanan)', String(done.length)],
      ['Toplam tutar (tamamlanan)', formatKurus(done.reduce((a, r) => a + BigInt(String(r.total)), 0n))],
      ['İptal / düzeltilmiş kayıt', String(rows.length - done.length)],
    ];
  };

  if (code === 'A') {
    scope.push(['Kapsam', p.customer ? 'Seçili müşteri' : `${formatDate(from)} – ${formatDate(to)} arasında işlemi olan müşteriler`], ['Kimlik numaraları', p.unmasked && ctx.can('sensitive.view') ? 'Açık (yetkili kullanıcı talebi)' : 'Maskeli']);
    const customers = await sql.query<Record<string, unknown>>(
      `select c.* from masak.customers c where c.organization_id = $1 and (
         ($4::uuid is not null and c.id = $4::uuid) or ($4::uuid is null and exists (select 1 from masak.transactions t where t.customer_id = c.id and ${RANGE_SQL('t.occurred_at')})))
        order by c.display_name`,
      [org, from, to, p.customer || null],
    );
    const rows: Record<string, string>[] = [];
    const checks: Record<string, string>[] = [];
    for (const c of customers) {
      versions.push({ entity: 'customers', id: String(c.id), version: Number(c.version) });
      const ks = await sql.query<Record<string, unknown>>(
        `select k.*, p.full_name from masak.customer_identity_checks k left join masak.profiles p on p.id = k.confirmed_by where k.customer_id = $1 order by k.checked_at desc`, [c.id]);
      const reps = await sql.query<{ n: number }>('select count(*)::int as n from masak.customer_representatives where customer_id = $1', [c.id]);
      const { missingFields } = await import('./customers');
      rows.push({
        name: String(c.display_name), kind: c.kind === 'legal' ? 'Tüzel' : 'Gerçek', id: await identityText(ctx, c, p),
        verified: ks.some((k) => k.status === 'verified') ? 'Doğrulandı' : ks.length ? 'Beklemede' : 'Kayıt yok',
        missing: missingFields(c, reps[0].n).join(', ') || '—', risk: label({ low: 'Düşük', standard: 'Standart', high: 'Yüksek' }, c.risk_level),
      });
      for (const k of ks)
        checks.push({
          name: String(c.display_name), when: formatDateTime(k.checked_at as Date), method: String(k.method), doc: String(k.document_type),
          status: k.status === 'verified' ? 'Doğrulandı' : k.status === 'pending' ? 'Beklemede' : 'Reddedildi',
          ocr: k.ocr_used ? (k.ocr_confirmed ? 'OCR + manuel onay' : 'OCR (onaysız)') : 'Manuel', by: String(k.full_name || '—'),
        });
    }
    sections.push({
      heading: 'Müşteri kimlik özeti',
      note: 'Eksik alanlar Tedbirler Yön. md. 6 (gerçek kişi) ve md. 7 (tüzel kişi) temel alınarak listelenir; hukuki doğrulama gerekir.',
      table: { columns: [{ key: 'name', label: 'Müşteri', width: 22 }, { key: 'kind', label: 'Tür', width: 8 }, { key: 'id', label: 'Kimlik/VKN', width: 14 }, { key: 'verified', label: 'Teyit', width: 11 }, { key: 'risk', label: 'Risk', width: 9 }, { key: 'missing', label: 'Eksik alanlar', width: 36 }], rows },
    });
    sections.push({
      heading: 'Kimlik tespit ve teyit kayıtları',
      note: 'OCR ile okunan bilgiler, personel belge aslıyla karşılaştırıp onaylamadıkça doğrulanmış sayılmaz. OCR resmi kimlik doğrulaması değildir.',
      table: { columns: [{ key: 'name', label: 'Müşteri', width: 20 }, { key: 'when', label: 'Zaman', width: 15 }, { key: 'method', label: 'Yöntem', width: 13 }, { key: 'doc', label: 'Belge', width: 15 }, { key: 'ocr', label: 'OCR', width: 15 }, { key: 'status', label: 'Durum', width: 10 }, { key: 'by', label: 'Onaylayan', width: 12 }], rows: checks },
    });
    return { sections, scope, versions, count: customers.length };
  }

  if (code === 'B') {
    if (!p.transaction) throw new AppError('TX_REQUIRED', 'İşlem seçin.');
    const { getTransaction } = await import('./transactions');
    const d = await getTransaction(ctx, p.transaction);
    const t = d.transaction;
    versions.push({ entity: 'transactions', id: String(t.id), version: Number(t.version) });
    scope.push(['İşlem', String(t.number)]);
    sections.push({
      heading: 'İşlem bilgileri',
      kv: [
        ['İşlem no', String(t.number)], ['Tarih/saat', formatDateTime(t.occurred_at as Date)], ['Müşteri', `${t.customer_name} (${t.identity_masked || t.tax_masked || '—'})`],
        ['Adına işlem yapılan', String(t.on_behalf_name || '—')], ['Temsilci/vekil', String(t.representative_name || '—')],
        ['İşlem türü', label(TX_TYPES, t.type)], ['Ürün', String(t.product_description)], ['Ayar / gram / adet', `${t.karat || '—'} / ${t.weight || '—'} / ${t.quantity}`],
        ['Birim fiyat', t.unit_raw ? fmt(t.unit_raw) : '—'], ['Toplam', `${formatKurus(String(t.total_raw), String(t.currency))}`], ['TL karşılığı', fmt(t.total_try)],
        ['Kur / kaynak / tarih', t.currency === 'TRY' ? '—' : `${t.fx} / ${t.fx_source} / ${t.fx_day}`], ['Ödeme', `${label(PAYMENT_METHODS, t.payment_method)} ${t.payment_reference ? `(${t.payment_reference})` : ''}`],
        ['Fatura/fiş', String(t.invoice_reference || '—')], ['Durum', label(TX_STATUS, t.status)], ['Kaydeden', String(t.created_by_name)],
        ['İptal gerekçesi', String(t.cancel_reason || '—')], ['Düzelttiği kayıt', String(t.corrects_number || '—')], ['Yerine geçen kayıt', String(t.superseded_by_number || '—')],
        ['Kayıt versiyonu', String(t.version)],
      ],
    });
    sections.push({
      heading: 'Kural değerlendirmeleri ve uyarılar',
      note: 'Uyarılar açıklayıcıdır; hukuki sonuç ve resmi bildirim kararı yetkili kişiye aittir.',
      table: {
        columns: [{ key: 'level', label: 'Seviye', width: 10 }, { key: 'rule', label: 'Kural', width: 14 }, { key: 'rationale', label: 'Gerekçe', width: 46 }, { key: 'source', label: 'Kaynak', width: 18 }, { key: 'status', label: 'Durum', width: 12 }],
        rows: d.alerts.filter((a) => !a.confidential || ctx.can('reports.confidential')).map((a) => ({
          level: LEVEL_LABELS[a.level as 'info'], rule: `${a.rule_key} v${a.rule_version}`, rationale: String(a.rationale), source: String(a.source_article),
          status: label({ open: 'Açık', acknowledged: 'Görüldü', resolved: 'Çözüldü', dismissed: 'Uygun bulunmadı' }, a.status),
        })),
      },
    });
    sections.push({
      heading: 'Bağlantı grupları',
      table: { columns: [{ key: 'status', label: 'Durum', width: 14 }, { key: 'txs', label: 'İşlemler', width: 40 }, { key: 'note', label: 'Gerekçe / karar', width: 46 }],
        rows: d.groups.map((g) => ({ status: label({ proposed: 'Önerildi', confirmed: 'Bağlantılı kabul', rejected: 'Reddedildi' }, g.status), txs: ((g.transactions as { number: string; total: string }[]) || []).map((x) => `${x.number} (${fmt(x.total)})`).join(', '), note: `${g.rationale}${g.decision_note ? ` — Karar: ${g.decision_note}` : ''}` })) },
    });
    sections.push({ heading: 'Belgeler', table: { columns: [{ key: 'title', label: 'Belge', width: 50 }, { key: 'kind', label: 'Tür', width: 20 }, { key: 'v', label: 'Versiyon', width: 10 }, { key: 'at', label: 'Yükleme', width: 20 }], rows: d.documents.map((x) => ({ title: String(x.title), kind: String(x.kind), v: String(x.version), at: formatDateTime(x.created_at as Date) })) } });
    sections.push({
      heading: 'Zaman çizelgesi ve denetim izi',
      table: { columns: [{ key: 'at', label: 'Zaman', width: 22 }, { key: 'action', label: 'Olay', width: 48 }, { key: 'by', label: 'Kullanıcı', width: 30 }],
        rows: (d.versions.length ? d.versions.map((v) => ({ at: formatDateTime(v.changed_at as Date), action: `Versiyon ${v.version} (${v.operation === 'insert' ? 'oluşturma' : 'değişiklik'}) — durum: ${label(TX_STATUS, v.status)}`, by: String(v.full_name || 'Sistem') })) : [])
          .concat(d.timeline.map((e) => ({ at: formatDateTime(e.created_at as Date), action: ACTION_LABELS[String(e.action)] || String(e.action), by: String(e.full_name || 'Sistem') }))) },
    });
    return { sections, scope, versions, count: 1 };
  }

  if (code === 'C' || code === 'D') {
    scope.push(['Dönem', code === 'C' ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`]);
    if (p.type) scope.push(['İşlem türü', label(TX_TYPES, p.type)]);
    if (p.status) scope.push(['Durum', label(TX_STATUS, p.status)]);
    const rows = await txRows(`${RANGE_SQL('t.occurred_at')} and ($4 = '' or t.type = $4) and ($5 = '' or t.status = $5)`, [from, to, p.type || '', p.status || '']);
    sections.push({ heading: 'Özet', kv: totals(rows) });
    if (code === 'D') {
      const byType = new Map<string, { n: number; sum: bigint }>();
      for (const r of rows.filter((r) => r.status === 'completed')) {
        const e = byType.get(String(r.type)) || { n: 0, sum: 0n };
        e.n++;
        e.sum += BigInt(String(r.total));
        byType.set(String(r.type), e);
      }
      sections.push({ heading: 'İşlem türüne göre', table: { columns: [{ key: 't', label: 'Tür', width: 50 }, { key: 'n', label: 'Adet', width: 20, align: 'right' }, { key: 's', label: 'Toplam', width: 30, align: 'right' }], rows: [...byType].map(([t, e]) => ({ t: label(TX_TYPES, t), n: String(e.n), s: formatKurus(e.sum) })) } });
      const alerts = await sql.query<{ rule_key: string; level: string; n: number }>(
        `select a.rule_key, a.level, count(*)::int as n from masak.compliance_alerts a join masak.transactions t on t.id = a.transaction_id
          where a.organization_id = $1 and ${RANGE_SQL('t.occurred_at')} and not a.confidential group by 1, 2 order by 1`, [org, from, to]);
      sections.push({ heading: 'Kural uyarıları (gizli olmayan)', table: { columns: [{ key: 'r', label: 'Kural', width: 50 }, { key: 'l', label: 'Seviye', width: 30 }, { key: 'n', label: 'Adet', width: 20, align: 'right' }], rows: alerts.map((a) => ({ r: a.rule_key, l: LEVEL_LABELS[a.level as 'info'], n: String(a.n) })) } });
    }
    sections.push({ heading: 'İşlem listesi', table: { columns: txCols, rows: txTable(rows) } });
    return { sections, scope, versions, count: rows.length };
  }

  if (code === 'E') {
    scope.push(['Dönem', `${formatDate(from)} – ${formatDate(to)}`]);
    const unverified = await txRows(
      `${RANGE_SQL('t.occurred_at')} and t.status = 'completed' and exists (select 1 from masak.compliance_alerts a where a.transaction_id = t.id and a.rule_key in ('KT-ESIK','KT-BAGLANTILI','KT-SUREKLI','KT-DOGRULUK'))
        and not exists (select 1 from masak.customer_identity_checks k where k.customer_id = t.customer_id and k.status = 'verified')`, [from, to]);
    sections.push({ heading: 'Kimlik tespiti gereken ancak onaylı teyit kaydı olmayan işlemler', note: 'Tedbirler Yön. md. 5/2: kimlik tespiti işlemden önce tamamlanır.', table: { columns: txCols, rows: txTable(unverified) } });
    const pending = await sql.query<Record<string, unknown>>(
      `select c.display_name, k.method, k.document_type, k.checked_at, k.ocr_used from masak.customer_identity_checks k join masak.customers c on c.id = k.customer_id
        where k.organization_id = $1 and k.status = 'pending' order by k.checked_at`, [org]);
    sections.push({ heading: 'Onay bekleyen kimlik teyit kayıtları', table: { columns: [{ key: 'n', label: 'Müşteri', width: 35 }, { key: 'm', label: 'Yöntem', width: 20 }, { key: 'd', label: 'Belge', width: 20 }, { key: 'w', label: 'Zaman', width: 25 }], rows: pending.map((k) => ({ n: String(k.display_name), m: `${k.method}${k.ocr_used ? ' (OCR onaysız)' : ''}`, d: String(k.document_type), w: formatDateTime(k.checked_at as Date) })) } });
    const open = await sql.query<Record<string, unknown>>(
      `select a.level, a.rule_key, a.rationale, t.number, c.display_name from masak.compliance_alerts a left join masak.transactions t on t.id = a.transaction_id left join masak.customers c on c.id = a.customer_id
        where a.organization_id = $1 and a.status = 'open' and not a.confidential and a.level <> 'info' order by a.level, a.created_at`, [org]);
    sections.push({ heading: 'Açık uyarılar (İnceleme Gerekli / Yüksek Öncelik)', table: { columns: [{ key: 'l', label: 'Seviye', width: 12 }, { key: 'r', label: 'Kural', width: 14 }, { key: 't', label: 'İşlem', width: 14 }, { key: 'c', label: 'Müşteri', width: 18 }, { key: 'x', label: 'Gerekçe', width: 42 }], rows: open.map((a) => ({ l: LEVEL_LABELS[a.level as 'info'], r: String(a.rule_key), t: String(a.number || '—'), c: String(a.display_name || '—'), x: String(a.rationale) })) } });
    return { sections, scope, versions, count: unverified.length + pending.length + open.length };
  }

  if (code === 'F') {
    scope.push(['Dönem', `${formatDate(from)} – ${formatDate(to)}`]);
    const groups = await sql.query<Record<string, unknown>>(
      `select g.*, pp.full_name as proposer, pd.full_name as decider,
              (select json_agg(json_build_object('number', t.number, 'total', t.total_try_kurus::text, 'status', t.status, 'at', t.occurred_at) order by t.occurred_at)
                 from masak.transaction_links l join masak.transactions t on t.id = l.transaction_id where l.group_id = g.id) as txs
         from masak.transaction_link_groups g left join masak.profiles pp on pp.id = g.proposed_by left join masak.profiles pd on pd.id = g.decided_by
        where g.organization_id = $1 and ${RANGE_SQL('g.created_at')} order by g.created_at`, [org, from, to]);
    groups.forEach((g) => versions.push({ entity: 'transaction_link_groups', id: String(g.id), version: Number(g.version) }));
    sections.push({
      heading: 'Bağlantı değerlendirmeleri',
      note: '"Bağlantılı işlem" mevzuatta tanımlanmamıştır (bkz. Yön. md. 5/1-b, 27/3, 32/2). Sistem işlemleri otomatik bağlamaz; toplama yalnızca yetkili kararıyla yapılır.',
      table: {
        columns: [{ key: 's', label: 'Durum', width: 12 }, { key: 'txs', label: 'İşlemler', width: 30 }, { key: 'sum', label: 'Toplam (geçerli)', width: 14, align: 'right' }, { key: 'why', label: 'Gerekçe', width: 24 }, { key: 'dec', label: 'Karar', width: 20 }],
        rows: groups.map((g) => {
          const txs = (g.txs as { number: string; total: string; status: string }[]) || [];
          const sum = txs.filter((x) => ['draft', 'completed'].includes(x.status)).reduce((a, x) => a + BigInt(x.total), 0n);
          return {
            s: label({ proposed: 'Önerildi', confirmed: 'Bağlantılı kabul', rejected: 'Reddedildi' }, g.status), txs: txs.map((x) => `${x.number}: ${fmt(x.total)}${x.status !== 'completed' ? ` (${label(TX_STATUS, x.status)})` : ''}`).join('; '),
            sum: formatKurus(sum), why: `${g.rationale} — Öneren: ${g.proposer}`, dec: g.decision_note ? `${g.decision_note} — ${g.decider}, ${formatDateTime(g.decided_at as Date)}` : 'Karar bekliyor',
          };
        }),
      },
    });
    return { sections, scope, versions, count: groups.length };
  }

  if (code === 'G') {
    scope.push(['Dönem', `${formatDate(from)} – ${formatDate(to)}`]);
    const rows = await txRows(RANGE_SQL('t.occurred_at'), [from, to]);
    const chain = await verifyAuditChain(ctx).catch(() => null);
    const evals = await sql.query<{ v: string; n: number }>(
      `select jsonb_array_elements_text(e.rule_versions) as v, count(distinct e.transaction_id)::int as n from masak.compliance_evaluations e
         join masak.transactions t on t.id = e.transaction_id where e.organization_id = $1 and ${RANGE_SQL('t.occurred_at')} group by 1 order by 1`, [org, from, to]);
    const rules = await sql.query<Record<string, unknown>>(`select rule_key, version, threshold_kurus::text as th, valid_from::text, valid_to::text, source_article, last_verified_at::text from masak.compliance_rules where status = 'active' and (organization_id is null or organization_id = $1) and valid_from <= $3::date and (valid_to is null or valid_to >= $2::date) order by rule_key, version`, [org, from, to]);
    const openCounts = await sql.query<{ level: string; n: number }>(`select level, count(*)::int as n from masak.compliance_alerts where organization_id = $1 and status = 'open' and not confidential group by level`, [org]);
    const exports = await sql.query<Record<string, unknown>>(`select r.reference, r.report_type, r.created_at, p.full_name from masak.report_exports r left join masak.profiles p on p.id = r.created_by where r.organization_id = $1 and not r.confidential and ${RANGE_SQL('r.created_at')} order by r.created_at`, [org, from, to]);
    sections.push({ heading: 'Dönem özeti', kv: [...totals(rows), ...openCounts.map((o): [string, string] => [`Açık uyarı — ${LEVEL_LABELS[o.level as 'info']}`, String(o.n)]), ['Denetim izi bütünlüğü', chain ? (chain.broken === 0 ? `Doğrulandı (${chain.total} kayıt, hash zinciri tutarlı)` : `UYARI: ${chain.broken} tutarsız kayıt`) : 'Bu kullanıcı için görüntülenemedi']] });
    sections.push({ heading: 'Dönemde yürürlükte olan kurallar', table: { columns: [{ key: 'k', label: 'Kural', width: 18 }, { key: 'v', label: 'Versiyon', width: 8 }, { key: 'th', label: 'Eşik', width: 14, align: 'right' }, { key: 'r', label: 'Yürürlük', width: 20 }, { key: 'a', label: 'Kaynak madde', width: 28 }, { key: 'c', label: 'Son kontrol', width: 12 }], rows: rules.map((r) => ({ k: String(r.rule_key), v: String(r.version), th: r.th ? fmt(r.th) : '—', r: `${formatDate(String(r.valid_from))} – ${r.valid_to ? formatDate(String(r.valid_to)) : '…'}`, a: String(r.source_article), c: formatDate(String(r.last_verified_at)) })) } });
    sections.push({ heading: 'Değerlendirmelerde uygulanan kural versiyonları', table: { columns: [{ key: 'v', label: 'Kural@versiyon', width: 60 }, { key: 'n', label: 'İşlem sayısı', width: 40, align: 'right' }], rows: evals.map((e) => ({ v: e.v, n: String(e.n) })) } });
    sections.push({ heading: 'Dönemde oluşturulan raporlar', table: { columns: [{ key: 'r', label: 'Referans', width: 30 }, { key: 't', label: 'Tür', width: 15 }, { key: 'at', label: 'Zaman', width: 25 }, { key: 'by', label: 'Hazırlayan', width: 30 }], rows: exports.map((e) => ({ r: String(e.reference), t: String(e.report_type), at: formatDateTime(e.created_at as Date), by: String(e.full_name) })) } });
    return { sections, scope, versions, count: rows.length };
  }

  if (code === 'H') {
    scope.push(['Dönem', `${formatDate(from)} – ${formatDate(to)}`]);
    const cases = await sql.query<Record<string, unknown>>(
      `select c.*, pa.full_name as assignee from masak.risk_cases c left join masak.profiles pa on pa.id = c.assigned_to
        where c.organization_id = $1 and ${RANGE_SQL('c.created_at')} order by c.created_at`, [org, from, to]);
    for (const c of cases) {
      versions.push({ entity: 'risk_cases', id: String(c.id), version: Number(c.version) });
      const events = await sql.query<Record<string, unknown>>('select e.*, p.full_name from masak.risk_case_events e join masak.profiles p on p.id = e.actor_id where e.case_id = $1 order by e.created_at', [c.id]);
      const txs = await sql.query<Record<string, unknown>>('select t.number, t.total_try_kurus::text as total from masak.risk_case_transactions x join masak.transactions t on t.id = x.transaction_id where x.case_id = $1', [c.id]);
      sections.push({
        heading: `${c.number} — ${c.title}`,
        kv: [['Durum', label(CASE_STATUS, c.status)], ['Neden', label(REASONS, c.reason_category)], ['Şüphenin oluştuğu zaman', formatDateTime(c.suspicion_at as Date)], ['İç takip son tarihi (10 iş günü)', formatDateTime(c.due_at as Date)], ['Sorumlu', String(c.assignee || '—')], ['İlgili işlemler', txs.map((t) => `${t.number} (${fmt(t.total)})`).join(', ') || 'Tutardan bağımsız — işlem bağlanmadı'], ['Açıklama', String(c.description)], ['Karar gerekçesi', String(c.decision_reason || '—')], ['Resmi kanal kaydı (yetkili beyanı)', c.official_report_reference ? `${c.official_report_date} — ${c.official_report_reference}` : '—']],
        table: { columns: [{ key: 'at', label: 'Zaman', width: 20 }, { key: 'k', label: 'Olay', width: 20 }, { key: 'n', label: 'Not', width: 42 }, { key: 'by', label: 'Kullanıcı', width: 18 }], rows: events.map((e) => ({ at: formatDateTime(e.created_at as Date), k: e.to_status ? `${label(CASE_STATUS, e.from_status)} → ${label(CASE_STATUS, e.to_status)}` : String(e.kind), n: String(e.note || ''), by: String(e.full_name) })) },
      });
    }
    if (!cases.length) sections.push({ heading: 'İç değerlendirmeler', paragraphs: ['Dönemde iç değerlendirme kaydı yok.'] });
    return { sections, scope, versions, count: cases.length };
  }

  // I
  scope.push(['Dönem', `${formatDate(from)} – ${formatDate(to)}`]);
  const members = await sql.query<Record<string, unknown>>(`select p.full_name, p.email, p.last_sign_in_at, m.role, m.granted, m.revoked, m.active, m.created_at from masak.organization_members m join masak.profiles p on p.id = m.user_id where m.organization_id = $1 order by p.full_name`, [org]);
  sections.push({ heading: 'Personel ve yetkiler', table: { columns: [{ key: 'n', label: 'Ad soyad', width: 22 }, { key: 'e', label: 'E-posta', width: 24 }, { key: 'r', label: 'Rol', width: 16 }, { key: 'x', label: 'Ek / geri alınan izin', width: 22 }, { key: 'l', label: 'Son giriş', width: 16 }], rows: members.map((m) => ({ n: String(m.full_name), e: String(m.email), r: `${ROLE_LABELS[m.role as Role]}${m.active ? '' : ' (pasif)'}`, x: [...((m.granted as string[]) || []).map((g) => `+${g}`), ...((m.revoked as string[]) || []).map((g) => `-${g}`)].join(', ') || '—', l: formatDateTime(m.last_sign_in_at as Date) })) } });
  const events = await sql.query<Record<string, unknown>>(`select e.created_at, e.action, e.entity_type, p.full_name from masak.audit_events e left join masak.profiles p on p.id = e.actor_id where e.organization_id = $1 and ${RANGE_SQL('e.created_at')} order by e.id limit 2000`, [org, from, to]);
  sections.push({ heading: 'Denetim izi', note: 'Gizli iç inceleme olayları yalnızca yetkili kullanıcılarda listelenir. Kişisel veri içermez.', table: { columns: [{ key: 'at', label: 'Zaman', width: 22 }, { key: 'a', label: 'Olay', width: 40 }, { key: 'e', label: 'Kayıt türü', width: 18 }, { key: 'by', label: 'Kullanıcı', width: 20 }], rows: events.map((e) => ({ at: formatDateTime(e.created_at as Date), a: ACTION_LABELS[String(e.action)] || String(e.action), e: String(e.entity_type || '—'), by: String(e.full_name || 'Sistem') })) } });
  return { sections, scope, versions, count: events.length };
}

/** Açık bir veritabanı işlemi içinde rapor üretir ve referansı/kaynak versiyonlarını kaydeder. */
export async function produceReport(ctx: Ctx, sql: Sql, code: ReportCode, p: ReportParams) {
  if (!canGenerate(ctx, code)) throw forbidden('Bu raporu oluşturma yetkiniz yok.');
  const reference = (await sql.query<{ n: string }>('select masak.next_number($1, $2) as n', [ctx.org.organizationId, 'report']))[0].n;
  // Aynı veritabanı işlemi içinde kalmak için iç bağlam (iç içe işlem açılmaz).
  const inner: Ctx = { ...ctx, db: (fn) => fn(sql) };
  const b = await build(inner, sql, code, p);
  const meta = REPORTS[code];
  const bytes = await renderPdf({
    title: `${code}) ${meta.title}`, reference, organizationName: ctx.org.organizationName, preparedBy: `${ctx.user.fullName} (${ROLE_LABELS[ctx.org.role]})`,
    generatedAt: new Date(), scope: b.scope, confidential: meta.confidential, sections: b.sections,
  });
  const hash = sha256(bytes);
  await sql.query(
    `insert into masak.report_exports (organization_id, report_type, format, reference, filters, record_count, record_versions, sha256, confidential, created_by)
     values ($1, $2, 'pdf', $3, $4::jsonb, $5, $6::jsonb, $7, $8, masak.uid())`,
    [ctx.org.organizationId, code, reference, JSON.stringify(p), b.count, JSON.stringify(b.versions), hash, meta.confidential],
  );
  await audit(sql, ctx.org.organizationId, 'report.exported', 'report_exports', null, { code, reference, sha256: hash, unmasked: Boolean(p.unmasked) }, meta.confidential);
  return { bytes, reference, sha256: hash, filename: `${reference}-${code}.pdf`, versions: b.versions };
}

export async function generateReport(ctx: Ctx, code: ReportCode, input: unknown) {
  if (!REPORTS[code]) throw new AppError('UNKNOWN_REPORT', 'Rapor türü bulunamadı.', 404);
  if (!canGenerate(ctx, code)) throw forbidden('Bu raporu oluşturma yetkiniz yok.');
  const p = paramsSchema.parse(input);
  if (p.unmasked) ctx.need('sensitive.view');
  return ctx.db((sql) => produceReport(ctx, sql, code, p));
}

// ---------- CSV dışa aktarma ----------
export const CSV_EXPORTS = {
  transactions: 'İşlemler',
  customers: 'Müşteriler (maskeli)',
  alerts: 'Kural uyarıları',
  audit: 'Denetim izi',
} as const;

export async function csvData(ctx: Ctx, sql: Sql, kind: keyof typeof CSV_EXPORTS, from: string, to: string) {
  const org = ctx.org.organizationId;
  if (kind === 'transactions') {
    const rows = await sql.query<Record<string, unknown>>(
      `select t.number, t.occurred_at, c.display_name, coalesce(c.identity_masked, c.tax_masked) as idm, t.type, t.product_description, t.karat, t.weight_grams::text as w, t.quantity,
              t.total_kurus::text as total, t.currency, t.total_try_kurus::text as total_try, t.payment_method, t.invoice_reference, t.status, t.version
         from masak.transactions t join masak.customers c on c.id = t.customer_id where t.organization_id = $1 and ${RANGE_SQL('t.occurred_at')} order by t.occurred_at`, [org, from, to]);
    return toCsv(['İşlem no', 'Tarih', 'Müşteri', 'Kimlik (maskeli)', 'Tür', 'Ürün', 'Ayar', 'Gram', 'Adet', 'Tutar', 'Para birimi', 'TL karşılığı', 'Ödeme', 'Fiş/fatura', 'Durum', 'Versiyon'],
      rows.map((r) => [r.number, formatDateTime(r.occurred_at as Date), r.display_name, r.idm, label(TX_TYPES, r.type), r.product_description, r.karat, r.w, r.quantity, fmt(r.total).replace(' TL', ''), r.currency, fmt(r.total_try).replace(' TL', ''), label(PAYMENT_METHODS, r.payment_method), r.invoice_reference, label(TX_STATUS, r.status), r.version]));
  }
  if (kind === 'customers') {
    const rows = await sql.query<Record<string, unknown>>(
      `select c.display_name, c.kind, coalesce(c.identity_masked, c.tax_masked) as idm, c.nationality, c.risk_level, c.continuous_relationship, c.created_at, c.version,
              exists (select 1 from masak.customer_identity_checks k where k.customer_id = c.id and k.status = 'verified') as verified
         from masak.customers c where c.organization_id = $1 order by c.display_name`, [org]);
    return toCsv(['Müşteri', 'Tür', 'Kimlik (maskeli)', 'Uyruk', 'Risk', 'Sürekli iş ilişkisi', 'Teyit', 'Oluşturma', 'Versiyon'],
      rows.map((r) => [r.display_name, r.kind === 'legal' ? 'Tüzel' : 'Gerçek', r.idm, r.nationality, r.risk_level, r.continuous_relationship ? 'Evet' : 'Hayır', r.verified ? 'Doğrulandı' : 'Yok/Beklemede', formatDateTime(r.created_at as Date), r.version]));
  }
  if (kind === 'alerts') {
    const rows = await sql.query<Record<string, unknown>>(
      `select a.created_at, a.level, a.rule_key, a.rule_version, a.title, a.rationale, a.source_article, a.status, t.number from masak.compliance_alerts a left join masak.transactions t on t.id = a.transaction_id
        where a.organization_id = $1 and not a.confidential and ${RANGE_SQL('a.created_at')} order by a.created_at`, [org, from, to]);
    return toCsv(['Zaman', 'Seviye', 'Kural', 'Versiyon', 'Başlık', 'Gerekçe', 'Kaynak', 'Durum', 'İşlem'], rows.map((r) => [formatDateTime(r.created_at as Date), LEVEL_LABELS[r.level as 'info'], r.rule_key, r.rule_version, r.title, r.rationale, r.source_article, r.status, r.number]));
  }
  ctx.need('audit.view');
  const rows = await sql.query<Record<string, unknown>>(
    `select e.id, e.created_at, e.action, e.entity_type, e.entity_id, p.full_name, e.hash from masak.audit_events e left join masak.profiles p on p.id = e.actor_id
      where e.organization_id = $1 and ${RANGE_SQL('e.created_at')} order by e.id`, [org, from, to]);
  return toCsv(['Sıra', 'Zaman', 'Olay', 'Kayıt türü', 'Kayıt kimliği', 'Kullanıcı', 'Hash'], rows.map((r) => [r.id, formatDateTime(r.created_at as Date), ACTION_LABELS[String(r.action)] || r.action, r.entity_type, r.entity_id, r.full_name || 'Sistem', r.hash]));
}

export async function exportCsv(ctx: Ctx, kind: keyof typeof CSV_EXPORTS, input: unknown) {
  ctx.need('export.data');
  if (!(kind in CSV_EXPORTS)) throw new AppError('UNKNOWN_EXPORT', 'Dışa aktarma türü bulunamadı.', 404);
  const p = paramsSchema.parse(input);
  const [from, to] = rangeOf(p);
  return ctx.db(async (sql) => {
    const csv = await csvData(ctx, sql, kind, from, to);
    const reference = (await sql.query<{ n: string }>('select masak.next_number($1, $2) as n', [ctx.org.organizationId, 'report']))[0].n;
    const hash = sha256(csv);
    await sql.query(`insert into masak.report_exports (organization_id, report_type, format, reference, filters, sha256, created_by) values ($1, 'CSV', 'csv', $2, $3::jsonb, $4, masak.uid())`,
      [ctx.org.organizationId, reference, JSON.stringify({ kind, from, to }), hash]);
    await audit(sql, ctx.org.organizationId, 'report.exported', 'report_exports', null, { kind, reference, sha256: hash });
    return { csv, reference, filename: `${reference}-${kind}.csv` };
  });
}

export { rangeOf };
