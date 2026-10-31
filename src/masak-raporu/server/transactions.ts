import 'server-only';
import { z } from 'zod';
import { parseTurkishDateTime } from '../dates';
import { convertWithRate, lineTotal, parseAmount, parseScaled, scaledToString } from '../money';
import { evaluate, type Finding, type LinkGroup, type Rule, type Tx } from '../rules/engine';
import { audit } from './audit';
import { missingFields } from './customers';
import type { Sql } from './db';
import { AppError, notFound } from './errors';
import type { Ctx } from './session';

export const TX_TYPES = {
  gold_sale: 'Altın satışı',
  gold_purchase: 'Altın alışı',
  scrap_gold_purchase: 'Hurda altın alışı',
  jewelry_sale: 'Takı/mücevher satışı',
  bullion: 'Külçe / gram altın',
  exchange: 'Değişim / takas',
  return: 'İade',
  other_precious: 'Diğer kıymetli maden/taş',
} as const;
export const PAYMENT_METHODS = {
  nakit: 'Nakit', banka_karti: 'Banka kartı', kredi_karti: 'Kredi kartı', havale_eft: 'Havale/EFT', altin: 'Altın ile', karma: 'Karma', diger: 'Diğer',
} as const;
export const TX_STATUS = { draft: 'Taslak', completed: 'Tamamlandı', cancelled: 'İptal', superseded: 'Düzeltildi' } as const;

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
export const transactionSchema = z
  .object({
    occurred_at: z.string().trim().min(1, 'Tarih gerekli.'),
    customer_id: z.string().uuid('Müşteri seçin.'),
    on_behalf_of_customer_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
    representative_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
    type: z.enum(Object.keys(TX_TYPES) as [keyof typeof TX_TYPES]),
    product_description: z.string().trim().min(2, 'Ürün açıklaması gerekli.').max(500),
    karat: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.union([z.null(), z.literal(8), z.literal(9), z.literal(10), z.literal(14), z.literal(18), z.literal(21), z.literal(22), z.literal(24)])),
    weight_grams: opt(20),
    quantity: z.coerce.number().int('Adet tam sayı olmalı.').positive('Adet pozitif olmalı.').max(100000).default(1),
    unit_price: opt(30),
    total: z.string().trim().min(1, 'Toplam tutar gerekli.'),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Para birimi 3 harfli kod olmalı.').default('TRY'),
    fx_rate: opt(20), fx_source: opt(120), fx_date: opt(10),
    payment_method: z.enum(Object.keys(PAYMENT_METHODS) as [keyof typeof PAYMENT_METHODS]),
    payment_reference: opt(120), invoice_reference: opt(120),
    related_transaction_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
    notes: opt(2000),
    status: z.enum(['draft', 'completed']).default('completed'),
  })
  .transform((v, c) => {
    try {
      const occurredAt = parseTurkishDateTime(v.occurred_at.replace('T', ' '));
      const total = parseAmount(v.total);
      const unit = v.unit_price ? parseAmount(v.unit_price) : null;
      if (unit !== null && lineTotal(unit, v.quantity) !== total) throw new Error('Toplam tutar, birim fiyat × adet ile eşleşmiyor.');
      if (v.currency !== 'TRY' && (!v.fx_rate || !v.fx_source || !v.fx_date)) throw new Error('Döviz işlemlerinde kur, kur kaynağı ve kur tarihi gerekli.');
      const totalTry = v.currency === 'TRY' ? total : convertWithRate(total, v.fx_rate!);
      const weight = v.weight_grams ? scaledToString(parseScaled(v.weight_grams, 3, 'Gramaj'), 3) : null;
      if (new Date(occurredAt).getTime() > Date.now() + 5 * 60_000) throw new Error('İşlem tarihi gelecekte olamaz.');
      return { ...v, occurredAt, total, unit, totalTry, weight };
    } catch (e) {
      c.addIssue({ code: 'custom', message: e instanceof Error ? e.message : 'Geçersiz değer.' });
      return z.NEVER;
    }
  });

async function insertTx(ctx: Ctx, sql: Sql, v: z.output<typeof transactionSchema>, extra: { corrects?: string; importBatch?: string; isDemo?: boolean } = {}) {
  const number = (await sql.query<{ n: string }>('select masak.next_number($1, $2) as n', [ctx.org.organizationId, 'transaction']))[0].n;
  const r = await sql.query<{ id: string }>(
    `insert into masak.transactions (organization_id, number, occurred_at, customer_id, on_behalf_of_customer_id, representative_id, type, product_description,
       karat, weight_grams, quantity, unit_price_kurus, total_kurus, currency, fx_rate, fx_source, fx_date, total_try_kurus, payment_method, payment_reference,
       invoice_reference, related_transaction_id, notes, status, corrects_transaction_id, import_batch, is_demo, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27, masak.uid()) returning id`,
    [ctx.org.organizationId, number, v.occurredAt, v.customer_id, v.on_behalf_of_customer_id || null, v.representative_id || null, v.type, v.product_description,
      v.karat, v.weight, v.quantity, v.unit?.toString() ?? null, v.total.toString(), v.currency, v.currency === 'TRY' ? null : v.fx_rate!.replace(',', '.'),
      v.currency === 'TRY' ? null : v.fx_source, v.currency === 'TRY' ? null : v.fx_date, v.totalTry.toString(), v.payment_method, v.payment_reference,
      v.invoice_reference, v.related_transaction_id || null, v.notes, v.status, extra.corrects || null, extra.importBatch || null, extra.isDemo || false],
  );
  return { id: r[0].id, number };
}

export async function createTransaction(ctx: Ctx, input: unknown, opts: { isDemo?: boolean } = {}) {
  ctx.need('records.write');
  const v = transactionSchema.parse(input);
  return ctx.db(async (sql) => {
    const t = await insertTx(ctx, sql, v, { isDemo: opts.isDemo });
    await audit(sql, ctx.org.organizationId, 'transaction.created', 'transactions', t.id, { number: t.number, type: v.type });
    const findings = await evaluateTransaction(ctx, sql, t.id);
    return { ...t, findings };
  });
}

export const reasonSchema = z.string().trim().min(10, 'Gerekçe en az 10 karakter olmalı.').max(1000);

/** İptal: kayıt silinmez; durum, gerekçe, iptal eden ve zaman tutulur. */
export async function cancelTransaction(ctx: Ctx, id: string, reason: string) {
  ctx.need('records.write');
  const why = reasonSchema.parse(reason);
  return ctx.db(async (sql) => {
    const r = await sql.query<{ id: string }>(
      `update masak.transactions set status = 'cancelled', cancel_reason = $3, cancelled_at = now(), cancelled_by = masak.uid()
        where id = $1 and organization_id = $2 and status = 'completed' returning id`,
      [id, ctx.org.organizationId, why],
    );
    if (!r[0]) throw new AppError('NOT_CANCELLABLE', 'Yalnızca tamamlanmış işlem iptal edilebilir.');
    await audit(sql, ctx.org.organizationId, 'transaction.cancelled', 'transactions', id);
    await reevaluateGroups(ctx, sql, id);
  });
}

/** Düzeltme: yeni işlem kaydı açılır, eskisi "düzeltildi" durumuna geçer; her iki kayıt da korunur. */
export async function correctTransaction(ctx: Ctx, id: string, input: unknown, reason: string) {
  ctx.need('records.write');
  const why = reasonSchema.parse(reason);
  const v = transactionSchema.parse(input);
  return ctx.db(async (sql) => {
    const old = (await sql.query<{ status: string }>('select status from masak.transactions where id = $1 and organization_id = $2', [id, ctx.org.organizationId]))[0];
    if (!old) throw notFound();
    if (old.status !== 'completed') throw new AppError('NOT_CORRECTABLE', 'Yalnızca tamamlanmış işlem düzeltilebilir.');
    const t = await insertTx(ctx, sql, { ...v, notes: [v.notes, `Düzeltme gerekçesi: ${why}`].filter(Boolean).join('\n') }, { corrects: id });
    await sql.query(`update masak.transactions set status = 'superseded', superseded_by = $2 where id = $1`, [id, t.id]);
    await audit(sql, ctx.org.organizationId, 'transaction.corrected', 'transactions', id, { replacement: t.id });
    await audit(sql, ctx.org.organizationId, 'transaction.created', 'transactions', t.id, { corrects: id });
    await evaluateTransaction(ctx, sql, t.id);
    await reevaluateGroups(ctx, sql, id);
    return t;
  });
}

// ---------- Kural değerlendirmesi ----------
type TxRow = { id: string; number: string; occurred_at: Date; total_try_kurus: string; status: Tx['status']; type: string; payment_method: string; customer_id: string; on_behalf_of_customer_id: string | null; representative_id: string | null; version: number };
const toTx = (r: TxRow): Tx => ({
  id: r.id, number: r.number, occurredAt: new Date(r.occurred_at).toISOString(), totalTryKurus: BigInt(r.total_try_kurus), status: r.status, type: r.type,
  paymentMethod: r.payment_method, customerId: r.customer_id, onBehalfOfCustomerId: r.on_behalf_of_customer_id, representativeId: r.representative_id,
});
const TX_COLS = 'id, number, occurred_at, total_try_kurus::text, status, type, payment_method, customer_id, on_behalf_of_customer_id, representative_id, version';

export async function loadRules(sql: Sql, org: string): Promise<Rule[]> {
  const rows = await sql.query<Record<string, unknown>>(
    `select organization_id, rule_key, version, title, kind, level, threshold_kurus::text, params, valid_from::text, valid_to::text, source_url, source_article, status
       from masak.compliance_rules where status = 'active' and (organization_id is null or organization_id = $1)`,
    [org],
  );
  return rows.map((r) => ({
    ruleKey: String(r.rule_key), version: Number(r.version), title: String(r.title), kind: r.kind as Rule['kind'], level: r.level as Rule['level'],
    thresholdKurus: r.threshold_kurus ? BigInt(String(r.threshold_kurus)) : null, params: (r.params as Record<string, unknown>) || {},
    validFrom: String(r.valid_from), validTo: r.valid_to ? String(r.valid_to) : null, sourceUrl: String(r.source_url), sourceArticle: String(r.source_article),
    status: 'active', organizationSpecific: Boolean(r.organization_id),
  }));
}

export async function evaluateTransaction(ctx: Ctx, sql: Sql, id: string): Promise<Finding[]> {
  const org = ctx.org.organizationId;
  const row = (await sql.query<TxRow>(`select ${TX_COLS} from masak.transactions where id = $1 and organization_id = $2`, [id, org]))[0];
  if (!row) throw notFound();
  const tx = toTx(row);
  const customer = (await sql.query<Record<string, unknown>>('select * from masak.customers where id = $1', [tx.customerId]))[0];
  const [reps, verified, groupRows, history, inCase, rules] = await Promise.all([
    sql.query<{ n: number }>('select count(*)::int as n from masak.customer_representatives where customer_id = $1', [tx.customerId]),
    sql.query<{ ok: boolean }>(`select exists (select 1 from masak.customer_identity_checks where customer_id = $1 and status = 'verified') as ok`, [tx.customerId]),
    sql.query<Omit<TxRow, 'status'> & { group_id: string; status: LinkGroup['status']; tx_status: Tx['status'] }>(
      `select g.id as group_id, g.status, t.id, t.number, t.occurred_at, t.total_try_kurus::text, t.status as tx_status, t.type, t.payment_method, t.customer_id,
              t.on_behalf_of_customer_id, t.representative_id, t.version
         from masak.transaction_links l join masak.transaction_link_groups g on g.id = l.group_id
         join masak.transaction_links l2 on l2.group_id = g.id join masak.transactions t on t.id = l2.transaction_id
        where l.transaction_id = $1`,
      [id],
    ),
    sql.query<TxRow>(
      `select ${TX_COLS} from masak.transactions where customer_id = $1 and id <> $2 and occurred_at between $3::timestamptz - interval '30 days' and $3::timestamptz + interval '30 days'`,
      [tx.customerId, id, tx.occurredAt],
    ),
    // Gizli: yalnızca cases.view izni olan kullanıcı bağlamında satır döner (RLS).
    sql.query<{ ok: boolean }>('select exists (select 1 from masak.risk_case_transactions where transaction_id = $1) as ok', [id]),
    loadRules(sql, org),
  ]);
  const groups = new Map<string, LinkGroup>();
  for (const g of groupRows) {
    const entry = groups.get(g.group_id) || { id: g.group_id, status: g.status, transactions: [] };
    entry.transactions.push(toTx({ ...g, status: g.tx_status }));
    groups.set(g.group_id, entry);
  }
  const findings = evaluate(rules, {
    tx,
    customer: {
      id: tx.customerId,
      continuousRelationship: Boolean(customer.continuous_relationship),
      identityDoubt: Boolean(customer.identity_doubt),
      hasVerifiedIdentity: verified[0].ok,
      missingFields: missingFields(customer, reps[0].n),
    },
    groups: [...groups.values()],
    customerHistory: history.map(toTx),
    inRiskCase: inCase[0].ok,
  });
  if (findings.length)
    await sql.query('select masak.upsert_alerts($1, $2::jsonb)', [
      org,
      JSON.stringify(
        findings.map((f) => ({
          fingerprint: f.fingerprint, transaction_id: f.transactionId, customer_id: f.customerId, link_group_id: f.linkGroupId || null,
          rule_key: f.ruleKey, rule_version: f.ruleVersion, level: f.level, title: f.title, rationale: f.rationale,
          source_url: f.sourceUrl, source_article: f.sourceArticle, confidential: f.confidential,
        })),
      ),
    ]);
  // Gizli bulgular değerlendirme kaydına yazılmaz (gizli uyarı tablosunda, yetki kontrollü tutulur).
  const visible = findings.filter((f) => !f.confidential);
  const applied = [...new Set(rules.filter((r) => findings.some((f) => f.ruleKey === r.ruleKey && f.ruleVersion === r.version)).map((r) => `${r.ruleKey}@v${r.version}`))];
  await sql.query(
    `insert into masak.compliance_evaluations (organization_id, transaction_id, transaction_version, rule_versions, findings, evaluated_by)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, masak.uid())`,
    [org, id, row.version, JSON.stringify(applied), JSON.stringify(visible.map(({ ruleKey, ruleVersion, level, title, rationale, identityRequired }) => ({ ruleKey, ruleVersion, level, title, rationale, identityRequired })))],
  );
  return findings;
}

async function reevaluateGroups(ctx: Ctx, sql: Sql, txId: string) {
  const ids = await sql.query<{ id: string }>(
    `select distinct l2.transaction_id as id from masak.transaction_links l join masak.transaction_links l2 on l2.group_id = l.group_id
      join masak.transactions t on t.id = l2.transaction_id where l.transaction_id = $1 and l2.transaction_id <> $1 and t.status in ('draft','completed')`,
    [txId],
  );
  for (const r of ids) await evaluateTransaction(ctx, sql, r.id);
}

// ---------- Bağlantılı işlemler ----------
export const LINK_BASIS = {
  ayni_musteri: 'Aynı müşteri', temsil_iliskisi: 'Temsil/vekalet ilişkisi', zaman_yakinligi: 'Zaman yakınlığı',
  ortak_belge: 'Ortak fatura/belge', odeme_iliskisi: 'Ortak ödeme kaynağı', diger: 'Diğer',
} as const;

export async function proposeLinkGroup(ctx: Ctx, txIds: string[], basis: string[], rationale: string) {
  ctx.need('records.write');
  const ids = z.array(z.string().uuid()).min(2, 'En az iki işlem seçin.').max(50).parse([...new Set(txIds)]);
  const b = z.array(z.enum(Object.keys(LINK_BASIS) as [keyof typeof LINK_BASIS])).min(1, 'En az bir dayanak seçin.').parse(basis);
  const why = z.string().trim().min(10, 'Gerekçe en az 10 karakter olmalı.').max(2000).parse(rationale);
  return ctx.db(async (sql) => {
    const g = await sql.query<{ id: string }>(
      `insert into masak.transaction_link_groups (organization_id, basis, rationale, proposed_by) values ($1, $2, $3, masak.uid()) returning id`,
      [ctx.org.organizationId, b, why],
    );
    for (const t of ids) await sql.query('insert into masak.transaction_links (organization_id, group_id, transaction_id) values ($1, $2, $3)', [ctx.org.organizationId, g[0].id, t]);
    await audit(sql, ctx.org.organizationId, 'link_group.proposed', 'transaction_link_groups', g[0].id, { count: ids.length });
    return g[0].id;
  });
}

export async function decideLinkGroup(ctx: Ctx, groupId: string, decision: 'confirmed' | 'rejected', note: string) {
  ctx.need('links.decide');
  const why = z.string().trim().min(10, 'Karar gerekçesi en az 10 karakter olmalı.').max(2000).parse(note);
  return ctx.db(async (sql) => {
    const r = await sql.query<{ id: string }>(
      `update masak.transaction_link_groups set status = $3, decided_by = masak.uid(), decided_at = now(), decision_note = $4
        where id = $1 and organization_id = $2 and status = 'proposed' returning id`,
      [groupId, ctx.org.organizationId, decision, why],
    );
    if (!r[0]) throw new AppError('ALREADY_DECIDED', 'Bu bağlantı için daha önce karar verilmiş.');
    await audit(sql, ctx.org.organizationId, 'link_group.decided', 'transaction_link_groups', groupId, { decision });
    const members = await sql.query<{ transaction_id: string }>('select transaction_id from masak.transaction_links where group_id = $1', [groupId]);
    for (const m of members) await evaluateTransaction(ctx, sql, m.transaction_id);
  });
}

export async function listLinkGroups(ctx: Ctx, status?: string) {
  ctx.need('records.read');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select g.id, g.status, g.basis, g.rationale, g.decision_note, g.created_at, g.decided_at, pp.full_name as proposed_by_name, pd.full_name as decided_by_name,
              coalesce(sum(t.total_try_kurus) filter (where t.status in ('draft','completed')), 0)::text as total,
              json_agg(json_build_object('id', t.id, 'number', t.number, 'total', t.total_try_kurus::text, 'status', t.status, 'occurred_at', t.occurred_at) order by t.occurred_at) as transactions
         from masak.transaction_link_groups g join masak.transaction_links l on l.group_id = g.id join masak.transactions t on t.id = l.transaction_id
         left join masak.profiles pp on pp.id = g.proposed_by left join masak.profiles pd on pd.id = g.decided_by
        where g.organization_id = $1 and ($2 = '' or g.status = $2)
        group by g.id, pp.full_name, pd.full_name order by g.created_at desc limit 100`,
      [ctx.org.organizationId, status || ''],
    ),
  );
}

// ---------- Listeleme ve ayrıntı ----------
export type TxFilters = { from?: string; to?: string; type?: string; status?: string; customer?: string; q?: string; page?: number; alerts?: string };

export async function listTransactions(ctx: Ctx, f: TxFilters) {
  ctx.need('records.read');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select t.id, t.number, t.occurred_at, t.type, t.product_description, t.total_try_kurus::text, t.currency, t.total_kurus::text, t.status, t.payment_method,
              t.is_demo, c.display_name as customer_name, c.id as customer_id,
              (select max(case a.level when 'high' then 3 when 'review' then 2 else 1 end) from masak.compliance_alerts a where a.transaction_id = t.id and a.status = 'open') as alert_rank
         from masak.transactions t join masak.customers c on c.id = t.customer_id
        where t.organization_id = $1
          and ($2 = '' or t.occurred_at >= ($2 || 'T00:00:00+03:00')::timestamptz)
          and ($3 = '' or t.occurred_at < (($3 || 'T00:00:00+03:00')::timestamptz + interval '1 day'))
          and ($4 = '' or t.type = $4) and ($5 = '' or t.status = $5) and ($6 = '' or t.customer_id::text = $6)
          and ($7 = '' or t.number ilike '%' || $7 || '%' or t.invoice_reference ilike '%' || $7 || '%' or c.display_name ilike '%' || $7 || '%')
          and ($9 = '' or exists (select 1 from masak.compliance_alerts a where a.transaction_id = t.id and a.status = 'open' and ($9 = 'any' or a.level = $9)))
        order by t.occurred_at desc limit 100 offset $8`,
      [ctx.org.organizationId, f.from || '', f.to || '', f.type || '', f.status || '', f.customer || '', (f.q || '').trim(), Math.max(0, (f.page || 1) - 1) * 100, f.alerts || ''],
    ),
  );
}

export async function getTransaction(ctx: Ctx, id: string) {
  ctx.need('records.read');
  return ctx.db(async (sql) => {
    const t = (
      await sql.query<Record<string, unknown>>(
        `select t.*, t.total_try_kurus::text as total_try, t.total_kurus::text as total_raw, t.unit_price_kurus::text as unit_raw, t.weight_grams::text as weight,
                t.fx_rate::text as fx, t.fx_date::text as fx_day, c.display_name as customer_name, c.identity_masked, c.tax_masked,
                ob.display_name as on_behalf_name, r.full_name as representative_name, p.full_name as created_by_name, pc.full_name as cancelled_by_name,
                ct.number as corrects_number, st.number as superseded_by_number
           from masak.transactions t join masak.customers c on c.id = t.customer_id
           left join masak.customers ob on ob.id = t.on_behalf_of_customer_id left join masak.customer_representatives r on r.id = t.representative_id
           left join masak.profiles p on p.id = t.created_by left join masak.profiles pc on pc.id = t.cancelled_by
           left join masak.transactions ct on ct.id = t.corrects_transaction_id left join masak.transactions st on st.id = t.superseded_by
          where t.id = $1 and t.organization_id = $2`,
        [id, ctx.org.organizationId],
      )
    )[0];
    if (!t) throw notFound('İşlem bulunamadı.');
    const [alerts, evaluations, groups, documents, timeline, versions] = await Promise.all([
      sql.query<Record<string, unknown>>(
        `select a.*, (select json_agg(json_build_object('decision', r.decision, 'note', r.note, 'at', r.created_at, 'by', p.full_name) order by r.created_at)
                        from masak.alert_reviews r join masak.profiles p on p.id = r.actor_id where r.alert_id = a.id) as reviews
           from masak.compliance_alerts a where a.transaction_id = $1 order by case a.level when 'high' then 1 when 'review' then 2 else 3 end, a.created_at`, [id]),
      sql.query<Record<string, unknown>>('select e.evaluated_at, e.transaction_version, e.rule_versions, e.findings, p.full_name from masak.compliance_evaluations e left join masak.profiles p on p.id = e.evaluated_by where e.transaction_id = $1 order by e.evaluated_at desc limit 20', [id]),
      sql.query<Record<string, unknown>>(
        `select g.id, g.status, g.rationale, g.decision_note, g.basis,
                (select json_agg(json_build_object('id', t2.id, 'number', t2.number, 'total', t2.total_try_kurus::text, 'status', t2.status) order by t2.occurred_at)
                   from masak.transaction_links l2 join masak.transactions t2 on t2.id = l2.transaction_id where l2.group_id = g.id) as transactions
           from masak.transaction_link_groups g join masak.transaction_links l on l.group_id = g.id where l.transaction_id = $1`, [id]),
      sql.query<Record<string, unknown>>('select id, kind, title, mime, size_bytes, version, superseded, created_at from masak.documents where transaction_id = $1 order by created_at desc', [id]),
      sql.query<Record<string, unknown>>(
        `select e.action, e.created_at, e.details, p.full_name from masak.audit_events e left join masak.profiles p on p.id = e.actor_id
          where e.organization_id = $2 and (e.entity_id = $1 or e.details->>'replacement' = $1::text or e.details->>'corrects' = $1::text) order by e.id`, [id, ctx.org.organizationId]),
      sql.query<Record<string, unknown>>(
        `select v.version, v.operation, v.changed_at, v.snapshot->>'status' as status, p.full_name from masak.record_versions v left join masak.profiles p on p.id = v.changed_by
          where v.entity_id = $1 order by v.id`, [id]),
    ]);
    return { transaction: t, alerts, evaluations, groups, documents, timeline, versions };
  });
}

export async function transactionOptions(ctx: Ctx, customerId?: string) {
  ctx.need('records.read');
  return ctx.db((sql) =>
    sql.query<{ id: string; number: string; occurred_at: Date; total: string; customer_name: string }>(
      `select t.id, t.number, t.occurred_at, t.total_try_kurus::text as total, c.display_name as customer_name
         from masak.transactions t join masak.customers c on c.id = t.customer_id
        where t.organization_id = $1 and t.status in ('draft','completed') and ($2 = '' or t.customer_id::text = $2)
        order by t.occurred_at desc limit 200`,
      [ctx.org.organizationId, customerId || ''],
    ),
  );
}
