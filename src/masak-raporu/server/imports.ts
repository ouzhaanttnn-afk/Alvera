import 'server-only';
import { randomUUID } from 'node:crypto';
import { duplicateKey, parseCsv, validateImport, type ImportIssue, type ImportRow, type Mapping } from '../csv';
import { audit } from './audit';
import { AppError } from './errors';
import { identifierHash } from './keys';
import type { Ctx } from './session';
import { evaluateTransaction } from './transactions';
import type { Sql } from './db';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

export type ImportPreview = {
  headers: string[];
  sample: string[][];
  valid: { line: number; occurredAt: string; customer: string; type: string; total: string; invoice: string | null }[];
  errors: ImportIssue[];
  duplicates: ImportIssue[];
};

async function analyse(ctx: Ctx, sql: Sql, csv: string, mapping: Mapping) {
  if (csv.length > MAX_BYTES) throw new AppError('CSV_TOO_LARGE', 'CSV dosyası en fazla 2 MB olabilir.');
  const table = parseCsv(csv);
  if (table.length < 2) throw new AppError('CSV_EMPTY', 'CSV dosyasında başlık ve en az bir satır olmalı.');
  if (table.length > MAX_ROWS + 1) throw new AppError('CSV_ROWS', `Tek seferde en fazla ${MAX_ROWS} satır içe aktarılabilir.`);
  const org = ctx.org.organizationId;
  // Mevcut işlemlerin mükerrer anahtarları (aynı tarih aralığı)
  const existing = await sql.query<{ occurred_at: Date; identity: string | null; total: string; invoice: string | null; customer_id: string }>(
    `select t.occurred_at, coalesce(c.identity_hash, c.tax_hash) as identity, t.total_kurus::text as total, t.invoice_reference as invoice, t.customer_id
       from masak.transactions t join masak.customers c on c.id = t.customer_id where t.organization_id = $1 and t.status <> 'cancelled'`,
    [org],
  );
  // Müşteri tanımlayıcısı veritabanında yalnızca HMAC olarak bulunduğundan, eşleştirme hash üzerinden yapılır.
  const keys = new Set(existing.map((e) => `${new Date(e.occurred_at).toISOString().slice(0, 16)}|${e.identity}|${e.total}|${(e.invoice || '').toLowerCase()}`));
  const result = validateImport(table, mapping, new Set());
  for (const r of [...result.rows]) if (r.currency !== 'TRY') {
    result.rows.splice(result.rows.indexOf(r), 1);
    result.errors.push({ line: r.line, field: 'currency', message: 'Döviz cinsinden satırlar içe aktarmada desteklenmiyor; TL karşılığını ve kur bilgisini işlem ekranından girin.' });
  }
  const customers = await sql.query<{ id: string; display_name: string; identity_hash: string | null; tax_hash: string | null }>(
    'select id, display_name, identity_hash, tax_hash from masak.customers where organization_id = $1', [org]);
  const byHash = new Map<string, { id: string; display_name: string }>();
  for (const c of customers) {
    if (c.identity_hash) byHash.set(c.identity_hash, c);
    if (c.tax_hash) byHash.set(c.tax_hash, c);
  }
  const rows: (ImportRow & { customerId: string; customerName: string })[] = [];
  for (const r of result.rows) {
    const h = identifierHash(org, r.customerIdentifier);
    const c = byHash.get(h);
    if (!c) {
      result.errors.push({ line: r.line, field: 'customer_identifier', message: 'Bu kimlik/vergi numarasıyla kayıtlı müşteri yok. Önce müşteriyi oluşturun.' });
      continue;
    }
    const key = duplicateKey({ ...r, customerIdentifier: h });
    if (keys.has(key)) {
      result.duplicates.push({ line: r.line, field: 'satır', message: 'Bu işlem sistemde zaten kayıtlı görünüyor.' });
      continue;
    }
    rows.push({ ...r, customerId: c.id, customerName: c.display_name });
  }
  return { table, rows, errors: result.errors.sort((a, b) => a.line - b.line), duplicates: result.duplicates.sort((a, b) => a.line - b.line) };
}

export async function previewImport(ctx: Ctx, csv: string, mapping: Mapping): Promise<ImportPreview> {
  ctx.need('records.write');
  return ctx.db(async (sql) => {
    const a = await analyse(ctx, sql, csv, mapping);
    return {
      headers: a.table[0],
      sample: a.table.slice(1, 6),
      valid: a.rows.map((r) => ({ line: r.line, occurredAt: r.occurredAt, customer: r.customerName, type: r.type, total: r.totalKurus.toString(), invoice: r.invoiceReference })),
      errors: a.errors.slice(0, 500),
      duplicates: a.duplicates.slice(0, 500),
    };
  });
}

/** Yalnızca hatasız satırlar tek işlemde (transaction) kaydedilir; her biri kural motorundan geçer. */
export async function commitImport(ctx: Ctx, csv: string, mapping: Mapping) {
  ctx.need('records.write');
  return ctx.db(async (sql) => {
    const a = await analyse(ctx, sql, csv, mapping);
    if (!a.rows.length) throw new AppError('NOTHING_TO_IMPORT', 'İçe aktarılacak geçerli satır yok.');
    const batch = randomUUID();
    for (const r of a.rows) {
      const number = (await sql.query<{ n: string }>('select masak.next_number($1, $2) as n', [ctx.org.organizationId, 'transaction']))[0].n;
      const t = await sql.query<{ id: string }>(
        `insert into masak.transactions (organization_id, number, occurred_at, customer_id, type, product_description, karat, weight_grams, quantity, unit_price_kurus,
           total_kurus, currency, total_try_kurus, payment_method, invoice_reference, notes, status, import_batch, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'TRY',$12,$13,$14,$15,'completed',$16, masak.uid()) returning id`,
        [ctx.org.organizationId, number, r.occurredAt, r.customerId, r.type, r.productDescription, r.karat, r.weightGrams, r.quantity, r.unitPriceKurus?.toString() ?? null,
          r.totalKurus.toString(), r.totalKurus.toString(), r.paymentMethod, r.invoiceReference, `CSV satır ${r.line}`, batch],
      );
      await evaluateTransaction(ctx, sql, t[0].id);
    }
    await audit(sql, ctx.org.organizationId, 'transactions.imported', 'transactions', null, { batch, imported: a.rows.length, errors: a.errors.length, duplicates: a.duplicates.length });
    return { imported: a.rows.length, skipped: a.errors.length + a.duplicates.length, batch };
  });
}

