import 'server-only';
import { z } from 'zod';
import { validTckn, validVkn } from '@/lib/validation';
import { maskIdentifier } from '../mrz';
import { audit } from './audit';
import type { Sql } from './db';
import { AppError, notFound } from './errors';
import { decryptField, encryptField, identifierHash } from './keys';
import type { Ctx } from './session';

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optDate = z.string().trim().optional().transform((v, c) => {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(v).getTime())) {
    c.addIssue({ code: 'custom', message: 'Tarih geçersiz.' });
    return z.NEVER;
  }
  return v;
});
const bool = z.union([z.literal('on'), z.literal('true'), z.boolean()]).optional().transform((v) => v === true || v === 'on' || v === 'true');

export const IDENTITY_TYPES = {
  tc_kimlik_karti: 'T.C. Kimlik Kartı',
  nufus_cuzdani: 'T.C. Nüfus Cüzdanı',
  pasaport: 'Pasaport',
  yabanci_kimlik: 'Yabancılara mahsus kimlik / ikamet izni',
  mavi_kart: 'Mavi Kart',
  diger: 'Diğer resmi belge',
} as const;

export const customerSchema = z
  .object({
    kind: z.enum(['natural', 'legal']),
    first_name: text(80), last_name: text(80), birth_date: optDate, birth_place: text(80), nationality: text(60),
    mother_name: text(80), father_name: text(80),
    identity_type: z.enum(Object.keys(IDENTITY_TYPES) as [keyof typeof IDENTITY_TYPES]).optional().or(z.literal('').transform(() => undefined)),
    identity_number: text(20), identity_document_number: text(30),
    legal_name: text(250), tax_office: text(80), tax_number: text(11), trade_registry_number: text(40), activity: text(200),
    address: text(500), phone: text(30), email: z.string().trim().max(254).email('E-posta geçersiz.').optional().or(z.literal('').transform(() => undefined)).transform((v) => v || null),
    occupation: text(120),
    continuous_relationship: bool, identity_doubt: bool,
    risk_level: z.enum(['low', 'standard', 'high']).default('standard'),
    risk_notes: text(2000),
    kvkk_notice_given: bool,
    allow_duplicate: bool,
  })
  .superRefine((v, c) => {
    if (v.kind === 'natural') {
      if (!v.first_name) c.addIssue({ code: 'custom', path: ['first_name'], message: 'Ad gerekli.' });
      if (!v.last_name) c.addIssue({ code: 'custom', path: ['last_name'], message: 'Soyad gerekli.' });
      const turkish = !v.nationality || /^(tc|t\.c\.|türkiye|turkiye|tr)$/i.test(v.nationality);
      if (v.identity_number && turkish && ['tc_kimlik_karti', 'nufus_cuzdani', undefined].includes(v.identity_type) && !validTckn(v.identity_number))
        c.addIssue({ code: 'custom', path: ['identity_number'], message: 'T.C. kimlik numarası sağlama kontrolünden geçmedi.' });
    } else {
      if (!v.legal_name) c.addIssue({ code: 'custom', path: ['legal_name'], message: 'Unvan gerekli.' });
      if (v.tax_number && !validVkn(v.tax_number) && !validTckn(v.tax_number))
        c.addIssue({ code: 'custom', path: ['tax_number'], message: 'Vergi kimlik numarası sağlama kontrolünden geçmedi.' });
    }
  });
export type CustomerInput = z.input<typeof customerSchema>;

/** Tedbirler Yön. md. 6 / md. 7 kapsamındaki temel alanlardan eksik olanlar (kimlik tespiti gerektiğinde uyarılır). */
export function missingFields(c: Record<string, unknown>, representatives = 0): string[] {
  const need: [string, string][] =
    c.kind === 'legal'
      ? [['legal_name', 'Unvan'], ['trade_registry_number', 'Ticaret sicil no'], ['tax_number_enc', 'Vergi kimlik no'], ['activity', 'Faaliyet konusu'], ['address', 'Açık adres'], ['phone', 'Telefon']]
      : [['first_name', 'Ad'], ['last_name', 'Soyad'], ['birth_date', 'Doğum tarihi'], ['nationality', 'Uyruk'], ['identity_type', 'Kimlik belgesi türü'], ['identity_number_enc', 'Kimlik numarası'], ['address', 'Adres'], ['occupation', 'İş/meslek']];
  const missing = need.filter(([k]) => !c[k]).map(([, label]) => label);
  if (c.kind === 'legal' && representatives === 0) missing.push('Temsile yetkili kişi');
  return missing;
}

function prepare(ctx: Ctx, v: z.infer<typeof customerSchema>) {
  const org = ctx.org.organizationId;
  const id = v.identity_number?.replace(/\s/g, '').toUpperCase() || null;
  const tax = v.tax_number?.replace(/\s/g, '') || null;
  return {
    kind: v.kind,
    display_name: v.kind === 'natural' ? `${v.first_name} ${v.last_name}` : v.legal_name!,
    first_name: v.kind === 'natural' ? v.first_name : null, last_name: v.kind === 'natural' ? v.last_name : null,
    birth_date: v.birth_date, birth_place: v.birth_place, nationality: v.nationality, mother_name: v.mother_name, father_name: v.father_name,
    identity_type: v.kind === 'natural' ? v.identity_type || null : null,
    identity_number_enc: id ? encryptField(id, `customer:identity:${org}`) : null,
    identity_hash: id ? identifierHash(org, id) : null,
    identity_masked: id ? maskIdentifier(id) : null,
    identity_document_number_enc: v.identity_document_number ? encryptField(v.identity_document_number, `customer:document:${org}`) : null,
    legal_name: v.kind === 'legal' ? v.legal_name : null, tax_office: v.tax_office,
    tax_number_enc: tax ? encryptField(tax, `customer:tax:${org}`) : null,
    tax_hash: tax ? identifierHash(org, tax) : null,
    tax_masked: tax ? maskIdentifier(tax) : null,
    trade_registry_number: v.trade_registry_number, activity: v.activity,
    address: v.address, phone: v.phone, email: v.email, occupation: v.occupation,
    continuous_relationship: v.continuous_relationship, identity_doubt: v.identity_doubt,
    risk_level: v.risk_level, risk_notes: v.risk_notes,
  };
}

export type DuplicateWarning = { id: string; display_name: string; reason: string };

async function duplicates(sql: Sql, org: string, data: ReturnType<typeof prepare>, exceptId?: string): Promise<DuplicateWarning[]> {
  const rows = await sql.query<{ id: string; display_name: string; reason: string }>(
    `select id, display_name,
            case when identity_hash = $2 or tax_hash = $3 then 'Aynı kimlik/vergi numarası'
                 else 'Aynı ad ve doğum tarihi' end as reason
       from masak.customers
      where organization_id = $1 and id is distinct from $5::uuid and (
        ($2::text is not null and identity_hash = $2) or ($3::text is not null and tax_hash = $3)
        or ($4::text is not null and $6::date is not null and lower(display_name) = lower($4) and birth_date = $6::date))
      limit 5`,
    [org, data.identity_hash, data.tax_hash, data.display_name, exceptId || null, data.birth_date],
  );
  return rows;
}

export async function createCustomer(ctx: Ctx, input: unknown, isDemo = false): Promise<{ id?: string; duplicates?: DuplicateWarning[] }> {
  ctx.need('records.write');
  const v = customerSchema.parse(input);
  const data = prepare(ctx, v);
  return ctx.db(async (sql) => {
    const dup = await duplicates(sql, ctx.org.organizationId, data);
    if (dup.some((d) => d.reason.startsWith('Aynı kimlik'))) return { duplicates: dup };
    if (dup.length && !v.allow_duplicate) return { duplicates: dup };
    const cols = Object.keys(data);
    const r = await sql.query<{ id: string }>(
      `insert into masak.customers (organization_id, created_by, is_demo, kvkk_notice_version, kvkk_notice_given_at, ${cols.join(', ')})
       values ($1, masak.uid(), $2, $3, $4, ${cols.map((_, i) => `$${i + 5}`).join(', ')}) returning id`,
      [ctx.org.organizationId, isDemo, v.kvkk_notice_given ? 'taslak-hukuk-onayi-bekliyor' : null, v.kvkk_notice_given ? new Date() : null, ...Object.values(data)],
    );
    await audit(sql, ctx.org.organizationId, 'customer.created', 'customers', r[0].id, { kind: v.kind });
    return { id: r[0].id };
  });
}

export async function updateCustomer(ctx: Ctx, id: string, input: unknown) {
  ctx.need('records.write');
  const v = customerSchema.parse(input);
  const data = prepare(ctx, v);
  return ctx.db(async (sql) => {
    const current = await sql.query<Record<string, unknown>>('select * from masak.customers where id = $1 and organization_id = $2', [id, ctx.org.organizationId]);
    if (!current[0]) throw notFound();
    const dup = (await duplicates(sql, ctx.org.organizationId, data, id)).filter((d) => d.reason.startsWith('Aynı kimlik'));
    if (dup.length) return { duplicates: dup };
    // Boş bırakılan şifreli kimlik alanı mevcut değeri silmez (yalnızca yeni değer girilirse değişir).
    const update: Record<string, unknown> = { ...data };
    for (const k of ['identity_number_enc', 'identity_hash', 'identity_masked', 'identity_document_number_enc', 'tax_number_enc', 'tax_hash', 'tax_masked'])
      if (update[k] === null) delete update[k];
    const cols = Object.keys(update);
    await sql.query(
      `update masak.customers set ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}, updated_by = masak.uid() where id = $1 and organization_id = $2`,
      [id, ctx.org.organizationId, ...Object.values(update)],
    );
    await audit(sql, ctx.org.organizationId, 'customer.updated', 'customers', id, { fields: cols.filter((c) => !c.endsWith('_enc') && !c.endsWith('_hash')) });
    return { id };
  });
}

export type CustomerFilters = { q?: string; kind?: string; risk?: string; page?: number };

export async function listCustomers(ctx: Ctx, f: CustomerFilters) {
  ctx.need('records.read');
  const q = (f.q || '').trim();
  const digits = q.replace(/\s/g, '');
  const hash = /^[A-Z0-9]{6,20}$/i.test(digits) ? identifierHash(ctx.org.organizationId, digits) : null;
  return ctx.db((sql) =>
    sql.query<{ id: string; kind: string; display_name: string; identity_masked: string | null; tax_masked: string | null; risk_level: string; verified: boolean; tx_count: number; last_tx: Date | null; is_demo: boolean }>(
      `select c.id, c.kind, c.display_name, c.identity_masked, c.tax_masked, c.risk_level, c.is_demo,
              exists (select 1 from masak.customer_identity_checks k where k.customer_id = c.id and k.status = 'verified') as verified,
              (select count(*)::int from masak.transactions t where t.customer_id = c.id) as tx_count,
              (select max(occurred_at) from masak.transactions t where t.customer_id = c.id) as last_tx
         from masak.customers c
        where c.organization_id = $1 and c.status = 'active'
          and ($2 = '' or c.display_name ilike '%' || $2 || '%' or c.identity_hash = $3 or c.tax_hash = $3)
          and ($4 = '' or c.kind = $4) and ($5 = '' or c.risk_level = $5)
        order by c.display_name limit 50 offset $6`,
      [ctx.org.organizationId, q, hash, f.kind || '', f.risk || '', Math.max(0, (f.page || 1) - 1) * 50],
    ),
  );
}

export type CustomerDetail = Awaited<ReturnType<typeof getCustomer>>;

export async function getCustomer(ctx: Ctx, id: string, reveal = false) {
  ctx.need('records.read');
  if (reveal) ctx.need('sensitive.view');
  return ctx.db(async (sql) => {
    const c = (await sql.query<Record<string, unknown>>('select * from masak.customers where id = $1 and organization_id = $2', [id, ctx.org.organizationId]))[0];
    if (!c) throw notFound('Müşteri bulunamadı.');
    const org = ctx.org.organizationId;
    const [checks, reps, owners, txs, docs] = await Promise.all([
      sql.query<Record<string, unknown>>(
        `select k.*, p.full_name as confirmed_by_name from masak.customer_identity_checks k left join masak.profiles p on p.id = k.confirmed_by
          where k.customer_id = $1 order by k.checked_at desc`, [id]),
      sql.query<Record<string, unknown>>('select id, relation, full_name, identity_masked, nationality, authority_document, valid_until::text from masak.customer_representatives where customer_id = $1 order by created_at', [id]),
      sql.query<Record<string, unknown>>('select id, full_name, identity_masked, nationality, ownership_percent::text, control_description from masak.beneficial_owners where customer_id = $1 order by created_at', [id]),
      sql.query<Record<string, unknown>>('select id, number, occurred_at, type, total_try_kurus::text, status from masak.transactions where customer_id = $1 or on_behalf_of_customer_id = $1 order by occurred_at desc limit 50', [id]),
      sql.query<Record<string, unknown>>('select id, kind, title, mime, size_bytes, version, superseded, created_at from masak.documents where customer_id = $1 order by created_at desc', [id]),
    ]);
    let revealed: { identity?: string; tax?: string; document?: string } | null = null;
    if (reveal) {
      revealed = {
        identity: c.identity_number_enc ? decryptField(String(c.identity_number_enc), `customer:identity:${org}`) : undefined,
        tax: c.tax_number_enc ? decryptField(String(c.tax_number_enc), `customer:tax:${org}`) : undefined,
        document: c.identity_document_number_enc ? decryptField(String(c.identity_document_number_enc), `customer:document:${org}`) : undefined,
      };
      await audit(sql, org, 'customer.sensitive_viewed', 'customers', id);
    }
    const sensitive = ctx.can('sensitive.view');
    const safe = { ...c };
    for (const k of Object.keys(safe)) if (k.endsWith('_enc') || k.endsWith('_hash')) delete safe[k];
    if (!sensitive) {
      safe.address = c.address ? String(c.address).slice(0, 12) + '…' : null;
      safe.phone = c.phone ? maskIdentifier(String(c.phone)) : null;
      safe.email = c.email ? String(c.email).replace(/^(.).*(@.*)$/, '$1•••$2') : null;
      safe.mother_name = c.mother_name ? '•••' : null;
      safe.father_name = c.father_name ? '•••' : null;
    }
    return {
      customer: safe,
      revealed,
      missing: missingFields(c, reps.length),
      verified: checks.some((k) => k.status === 'verified'),
      checks, representatives: reps, owners, transactions: txs, documents: docs,
    };
  });
}

export const identityCheckSchema = z.object({
  method: z.enum(['belge_inceleme', 'ocr_destekli', 'resmi_sorgu', 'diger']),
  document_type: z.enum(Object.keys(IDENTITY_TYPES) as [keyof typeof IDENTITY_TYPES]).or(z.enum(['ticaret_sicil', 'vergi_levhasi', 'imza_sirküleri'])),
  ocr_used: bool,
  confirm: bool,
  notes: text(1000),
});

/**
 * Kimlik tespit/teyit kaydı. OCR kullanıldıysa ve kullanıcı belgeyle karşılaştırdığını onaylamadıysa
 * kayıt "beklemede" kalır; veritabanı kısıtı da OCR onayı olmadan "doğrulandı" durumuna izin vermez.
 */
export async function addIdentityCheck(ctx: Ctx, customerId: string, input: unknown) {
  ctx.need('records.write');
  const v = identityCheckSchema.parse(input);
  return ctx.db(async (sql) => {
    const r = await sql.query<{ id: string; status: string }>(
      `insert into masak.customer_identity_checks (organization_id, customer_id, method, document_type, ocr_used, ocr_confirmed, status, confirmed_by, confirmed_at, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, masak.uid()) returning id, status`,
      [ctx.org.organizationId, customerId, v.method, v.document_type, v.ocr_used, v.ocr_used && v.confirm, v.confirm ? 'verified' : 'pending',
        v.confirm ? ctx.user.id : null, v.confirm ? new Date() : null, v.notes],
    );
    await audit(sql, ctx.org.organizationId, v.confirm ? 'identity_check.confirmed' : 'identity_check.created', 'customer_identity_checks', r[0].id, { method: v.method, ocr: v.ocr_used });
    return r[0];
  });
}

export async function confirmIdentityCheck(ctx: Ctx, checkId: string, ocrConfirmed: boolean) {
  ctx.need('records.write');
  return ctx.db(async (sql) => {
    const r = await sql.query<{ id: string; ocr_used: boolean }>(
      `select id, ocr_used from masak.customer_identity_checks where id = $1 and organization_id = $2 and status = 'pending'`, [checkId, ctx.org.organizationId]);
    if (!r[0]) throw notFound();
    if (r[0].ocr_used && !ocrConfirmed) throw new AppError('OCR_NOT_CONFIRMED', 'OCR ile okunan bilgileri belge aslıyla karşılaştırdığınızı onaylamalısınız.');
    await sql.query(
      `update masak.customer_identity_checks set status = 'verified', ocr_confirmed = ocr_used and $2, confirmed_by = masak.uid(), confirmed_at = now() where id = $1`,
      [checkId, ocrConfirmed],
    );
    await audit(sql, ctx.org.organizationId, 'identity_check.confirmed', 'customer_identity_checks', checkId);
  });
}

export const personSchema = z.object({
  full_name: z.string().trim().min(3, 'Ad soyad gerekli.').max(160),
  identity_number: text(20),
  nationality: text(60),
  relation: z.enum(['yetkili_temsilci', 'vekil', 'kanuni_temsilci', 'diger']).optional(),
  authority_document: text(300),
  valid_until: optDate,
  ownership_percent: z.string().trim().optional().transform((v, c) => {
    if (!v) return null;
    const n = v.replace(',', '.');
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(n) || Number(n) > 100) {
      c.addIssue({ code: 'custom', message: 'Pay oranı 0–100 arasında olmalı.' });
      return z.NEVER;
    }
    return n;
  }),
  control_description: text(500),
});

export async function addPerson(ctx: Ctx, customerId: string, kind: 'representative' | 'owner', input: unknown) {
  ctx.need('records.write');
  const v = personSchema.parse(input);
  const org = ctx.org.organizationId;
  const id = v.identity_number?.replace(/\s/g, '').toUpperCase() || null;
  const enc = id ? encryptField(id, `person:identity:${org}`) : null;
  return ctx.db(async (sql) => {
    if (kind === 'representative') {
      const r = await sql.query<{ id: string }>(
        `insert into masak.customer_representatives (organization_id, customer_id, relation, full_name, identity_number_enc, identity_hash, identity_masked, nationality, authority_document, valid_until, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, masak.uid()) returning id`,
        [org, customerId, v.relation || 'yetkili_temsilci', v.full_name, enc, id ? identifierHash(org, id) : null, id ? maskIdentifier(id) : null, v.nationality, v.authority_document, v.valid_until],
      );
      await audit(sql, org, 'representative.created', 'customer_representatives', r[0].id);
    } else {
      const r = await sql.query<{ id: string }>(
        `insert into masak.beneficial_owners (organization_id, customer_id, full_name, identity_number_enc, identity_hash, identity_masked, nationality, ownership_percent, control_description, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, masak.uid()) returning id`,
        [org, customerId, v.full_name, enc, id ? identifierHash(org, id) : null, id ? maskIdentifier(id) : null, v.nationality, v.ownership_percent, v.control_description],
      );
      await audit(sql, org, 'beneficial_owner.created', 'beneficial_owners', r[0].id);
    }
  });
}

export async function customerOptions(ctx: Ctx) {
  ctx.need('records.read');
  return ctx.db((sql) =>
    sql.query<{ id: string; display_name: string; identity_masked: string | null; tax_masked: string | null }>(
      `select id, display_name, identity_masked, tax_masked from masak.customers where organization_id = $1 and status = 'active' order by display_name limit 500`,
      [ctx.org.organizationId],
    ),
  );
}
