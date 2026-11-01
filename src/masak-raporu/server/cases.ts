import 'server-only';
import { z } from 'zod';
import { addBusinessDays } from '../dates';
import { audit } from './audit';
import { AppError, notFound } from './errors';
import type { Ctx } from './session';
import { evaluateTransaction } from './transactions';

// ŞİB iç değerlendirme merkezi. Bu sistem MASAK Online'ın yerine geçmez; resmi bildirim yetkili kişi
// tarafından MASAK Online üzerinden yapılır. Burada yalnızca iç hazırlık, karar ve durum kaydı tutulur.

export const CASE_STATUS = {
  submitted: 'Yeni bildirim',
  investigating: 'Araştırılıyor',
  info_needed: 'Ek bilgi gerekli',
  report_considered: 'Resmi bildirim değerlendirilecek',
  reported_externally: 'Yetkili tarafından resmi kanaldan bildirildi (kayıt)',
  closed: 'Kapatıldı',
} as const;

export const REASONS = {
  kimlik: 'Kimlik ibrazından kaçınma / şüpheli kimlik',
  bolme: 'İşlemin bölünmesi (eşikten kaçınma)',
  nakit: 'Olağandışı nakit kullanımı',
  kaynak: 'Fon kaynağını açıklamaktan kaçınma',
  orantisiz: 'Gelir/meslekle orantısız işlem',
  ucuncu_kisi: 'Üçüncü kişi adına/ödemesi',
  hurda: 'Hurda altın / çalıntı şüphesi',
  fatura: 'Fatura tutarı manipülasyonu talebi',
  diger: 'Diğer',
} as const;

/** MASAK Kuyumcular ŞİB Rehberi 2.0'daki örnek şüpheli işlem tiplerinden seçmeler (yakın aktarım). */
export const RISK_INDICATORS = [
  ['T-008-2.2', 'Küçük kupürlerle yüksek tutarda nakit ödeme veya az kullanılan bir dövizle ödeme'],
  ['T-008-2.3', 'Birbirinden bağımsız görünen müşterilerin aynı adres veya telefon bilgisini vermesi'],
  ['T-008-2.5 / 2.8', 'Tespit ve bildirimden kaçınmak için işlemin gerekçesiz bölünmesi'],
  ['T-008-2.7', 'Kimlik ibraz etmeden, sahte isimle veya başkası adına işlem yapmaya teşebbüs'],
  ['T-008-2.9', 'Meslek ve gelirle orantısız sıklıkta ve tutarda işlem'],
  ['T-008-2.15 / 2.16', 'Değer, boyut veya renge bakmadan rastgele alım; indirim/pazarlık istememe'],
  ['T-008-2.18 / 2.21', 'Büyük miktarda nakit, ardışık havaleler, üçüncü kişilere ödeme yaptırma veya üçüncü kişinin kartını kullanma'],
  ['T-008-2.20 / 2.32', 'Yüksek fiyatlı ürünü yalnızca nakitle alma; bankacılık sistemi dışında ödemede ısrar'],
  ['T-008-2.23 / 2.24', 'Faturanın yüksek/düşük gösterilmesini veya aynı işlem için birden fazla fatura isteme'],
  ['T-008-2.26', 'Kısa süre önce alınan ürünü farklı ödeme yöntemleriyle hızla geri satma'],
  ['T-008-2.28', 'Ödemeyi veya tahsilatı kripto varlıkla yapmak isteme'],
  ['T-008-2.29', 'Yüksek miktarda hurda altın satışı veya çalıntı olduğu şüphesi'],
  ['T-008-1.11', 'İşlemin amacını veya fonun kaynağını açıklamaktan kaçınma'],
  ['T-008-3.6', 'Malvarlığı dondurulanlar listesindeki bir isimle benzerlik'],
] as const;
export const GUIDE_URL = 'https://ms.hmb.gov.tr/uploads/sites/12/2025/06/SIB-REHBER-KUYUMCULAR-2.0-19936ffcf75ce5f9.pdf';

export const caseSchema = z.object({
  title: z.string().trim().min(3, 'Başlık gerekli.').max(200),
  reason_category: z.enum(Object.keys(REASONS) as [keyof typeof REASONS]),
  description: z.string().trim().min(10, 'Açıklama en az 10 karakter olmalı.').max(5000),
  suspicion_at: z.string().trim().min(1, 'Şüphenin oluştuğu zaman gerekli.'),
  transactions: z.array(z.string().uuid()).max(50).default([]),
});

/** Tutardan bağımsız: işlem seçilmeden de oluşturulabilir. Personel kaydı oluşturduktan sonra içeriği göremez. */
export async function submitCase(ctx: Ctx, input: unknown) {
  ctx.need('cases.create');
  const v = caseSchema.parse(input);
  const suspicion = new Date(v.suspicion_at.length === 16 ? `${v.suspicion_at}:00+03:00` : v.suspicion_at);
  if (Number.isNaN(suspicion.getTime()) || suspicion.getTime() > Date.now() + 60_000) throw new AppError('INVALID_DATE', 'Şüphe tarihi geçersiz.');
  const due = addBusinessDays(suspicion, 10);
  return ctx.db(async (sql) => {
    const r = await sql.query<{ n: string }>('select masak.submit_case($1, $2, $3, $4, $5, $6, $7::uuid[]) as n', [
      ctx.org.organizationId, v.title, v.reason_category, v.description, suspicion, due, v.transactions,
    ]);
    if (ctx.can('cases.view')) for (const t of v.transactions) await evaluateTransaction(ctx, sql, t);
    return r[0].n;
  });
}

export async function listCases(ctx: Ctx, status?: string) {
  ctx.need('cases.view');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select c.id, c.number, c.title, c.status, c.reason_category, c.suspicion_at, c.due_at, c.created_at, p.full_name as assigned_name,
              (select count(*)::int from masak.risk_case_transactions x where x.case_id = c.id) as tx_count
         from masak.risk_cases c left join masak.profiles p on p.id = c.assigned_to
        where c.organization_id = $1 and ($2 = '' or c.status = $2) order by (c.status = 'closed'), c.due_at`,
      [ctx.org.organizationId, status || ''],
    ),
  );
}

export async function getCase(ctx: Ctx, id: string) {
  ctx.need('cases.view');
  return ctx.db(async (sql) => {
    const c = (await sql.query<Record<string, unknown>>(
      `select c.*, c.official_report_date::text as report_day, pa.full_name as assigned_name, pc.full_name as created_by_name
         from masak.risk_cases c left join masak.profiles pa on pa.id = c.assigned_to left join masak.profiles pc on pc.id = c.created_by
        where c.id = $1 and c.organization_id = $2`, [id, ctx.org.organizationId]))[0];
    if (!c) throw notFound('İnceleme bulunamadı.');
    const [events, txs, docs, members] = await Promise.all([
      sql.query<Record<string, unknown>>('select e.*, p.full_name from masak.risk_case_events e join masak.profiles p on p.id = e.actor_id where e.case_id = $1 order by e.created_at', [id]),
      sql.query<Record<string, unknown>>(
        `select t.id, t.number, t.occurred_at, t.total_try_kurus::text as total, t.type, t.status, cu.display_name as customer_name
           from masak.risk_case_transactions x join masak.transactions t on t.id = x.transaction_id join masak.customers cu on cu.id = t.customer_id where x.case_id = $1`, [id]),
      sql.query<Record<string, unknown>>('select id, title, kind, created_at from masak.documents where case_id = $1 order by created_at desc', [id]),
      sql.query<{ user_id: string; full_name: string }>(
        `select m.user_id, p.full_name from masak.organization_members m join masak.profiles p on p.id = m.user_id
          where m.organization_id = $1 and m.active and m.role in ('owner','compliance_officer')`, [ctx.org.organizationId]),
    ]);
    return { case: c, events, transactions: txs, documents: docs, assignees: members };
  });
}

export const caseUpdateSchema = z
  .object({
    status: z.enum(Object.keys(CASE_STATUS) as [keyof typeof CASE_STATUS]),
    note: z.string().trim().min(5, 'Değerlendirme notu gerekli.').max(5000),
    assigned_to: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
    decision_reason: z.string().trim().max(5000).optional(),
    official_report_date: z.string().optional(),
    official_report_reference: z.string().trim().max(120).optional(),
  })
  .superRefine((v, c) => {
    if (v.status === 'reported_externally' && (!v.official_report_date || !v.official_report_reference))
      c.addIssue({ code: 'custom', message: 'Resmi kanaldan yapılmış bildirimin tarihi ve referansı girilmelidir.' });
    if (v.status === 'closed' && !(v.decision_reason && v.decision_reason.length >= 10))
      c.addIssue({ code: 'custom', message: 'Kapatma için karar gerekçesi (en az 10 karakter) gerekli.' });
  });

export async function updateCase(ctx: Ctx, id: string, input: unknown) {
  ctx.need('cases.manage');
  const v = caseUpdateSchema.parse(input);
  return ctx.db(async (sql) => {
    const old = (await sql.query<{ status: string }>('select status from masak.risk_cases where id = $1 and organization_id = $2', [id, ctx.org.organizationId]))[0];
    if (!old) throw notFound();
    await sql.query(
      `update masak.risk_cases set status = $3, assigned_to = coalesce($4::uuid, assigned_to), decision_reason = coalesce(nullif($5, ''), decision_reason),
              official_report_date = coalesce(nullif($6, '')::date, official_report_date), official_report_reference = coalesce(nullif($7, ''), official_report_reference),
              updated_at = now()
        where id = $1 and organization_id = $2`,
      [id, ctx.org.organizationId, v.status, v.assigned_to || null, v.decision_reason || '', v.official_report_date || '', v.official_report_reference || ''],
    );
    await sql.query(
      `insert into masak.risk_case_events (organization_id, case_id, actor_id, kind, from_status, to_status, note) values ($1, $2, masak.uid(), $3, $4, $5, $6)`,
      [ctx.org.organizationId, id, v.status === 'reported_externally' ? 'official_report' : old.status === v.status ? 'note' : 'status', old.status, v.status, v.note],
    );
    await audit(sql, ctx.org.organizationId, 'case.updated', 'risk_cases', id, { to: v.status }, true);
    // Bağlı işlemler yetkili bağlamda yeniden değerlendirilir (şüphe halinde tutardan bağımsız kimlik tespiti uyarısı).
    const linked = await sql.query<{ transaction_id: string }>('select transaction_id from masak.risk_case_transactions where case_id = $1', [id]);
    for (const t of linked) await evaluateTransaction(ctx, sql, t.transaction_id);
  });
}

export async function linkCaseTransaction(ctx: Ctx, caseId: string, txId: string) {
  ctx.need('cases.manage');
  return ctx.db(async (sql) => {
    await sql.query('insert into masak.risk_case_transactions (organization_id, case_id, transaction_id) values ($1, $2, $3) on conflict do nothing', [ctx.org.organizationId, caseId, txId]);
    await sql.query(`insert into masak.risk_case_events (organization_id, case_id, actor_id, kind, note) values ($1, $2, masak.uid(), 'link', 'İşlem incelemeye bağlandı.')`, [ctx.org.organizationId, caseId]);
    await evaluateTransaction(ctx, sql, txId);
  });
}
