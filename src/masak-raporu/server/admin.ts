import 'server-only';
import { z } from 'zod';
import { ADJUSTABLE, ROLES } from '../permissions';
import { audit } from './audit';
import { raporConfig } from './config';
import { AppError } from './errors';
import type { Ctx } from './session';

// ---------- Personel ----------
export async function listMembers(ctx: Ctx) {
  ctx.need('records.read');
  return ctx.db(async (sql) => ({
    members: await sql.query<Record<string, unknown>>(
      `select m.id, m.user_id, m.role, m.granted, m.revoked, m.active, m.created_at, p.full_name, p.email, p.last_sign_in_at
         from masak.organization_members m join masak.profiles p on p.id = m.user_id where m.organization_id = $1 order by m.active desc, p.full_name`,
      [ctx.org.organizationId]),
    invitations: ctx.can('members.manage')
      ? await sql.query<Record<string, unknown>>(
          `select id, email, role, expires_at, accepted_at, revoked_at, created_at from masak.invitations where organization_id = $1 order by created_at desc limit 50`,
          [ctx.org.organizationId])
      : [],
  }));
}

export const memberSchema = z.object({
  role: z.enum(ROLES),
  granted: z.array(z.enum(ADJUSTABLE as [string, ...string[]])).default([]),
  revoked: z.array(z.enum(ADJUSTABLE as [string, ...string[]])).default([]),
  active: z.boolean(),
});

export async function updateMember(ctx: Ctx, memberId: string, input: unknown) {
  ctx.need('members.manage');
  const v = memberSchema.parse(input);
  return ctx.db(async (sql) => {
    const r = await sql.query<{ id: string }>(
      `update masak.organization_members set role = $3, granted = $4, revoked = $5, active = $6 where id = $1 and organization_id = $2 returning id`,
      [memberId, ctx.org.organizationId, v.role, v.granted, v.revoked, v.active],
    );
    if (!r[0]) throw new AppError('NOT_ALLOWED', 'Personel bulunamadı veya kendi yetkinizi değiştiremezsiniz.', 403);
    await audit(sql, ctx.org.organizationId, 'member.updated', 'organization_members', memberId, v);
  });
}

export async function revokeInvitation(ctx: Ctx, id: string) {
  ctx.need('members.manage');
  return ctx.db(async (sql) => {
    await sql.query('update masak.invitations set revoked_at = now() where id = $1 and organization_id = $2 and accepted_at is null', [id, ctx.org.organizationId]);
    await audit(sql, ctx.org.organizationId, 'invitation.revoked', 'invitations', id);
  });
}

export async function memberActivity(ctx: Ctx, userId: string) {
  ctx.need('audit.view');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select action, entity_type, entity_id, created_at from masak.audit_events where organization_id = $1 and actor_id = $2 order by id desc limit 50`,
      [ctx.org.organizationId, userId]),
  );
}

export async function auditLog(ctx: Ctx, f: { from?: string; to?: string; action?: string }) {
  ctx.need('audit.view');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select e.id, e.action, e.entity_type, e.entity_id, e.details, e.created_at, e.hash, e.prev_hash, p.full_name
         from masak.audit_events e left join masak.profiles p on p.id = e.actor_id
        where e.organization_id = $1 and ($2 = '' or e.created_at >= ($2 || 'T00:00:00+03:00')::timestamptz)
          and ($3 = '' or e.created_at < (($3 || 'T00:00:00+03:00')::timestamptz + interval '1 day')) and ($4 = '' or e.action like $4 || '%')
        order by e.id desc limit 300`,
      [ctx.org.organizationId, f.from || '', f.to || '', f.action || '']),
  );
}

/** Hash zincirinin bütünlüğünü yeniden hesaplayarak doğrular. */
export async function verifyAuditChain(ctx: Ctx) {
  ctx.need('audit.view');
  return ctx.db(async (sql) => {
    const r = await sql.query<{ broken: number; total: number }>(
      `with c as (select id, hash, prev_hash, lag(hash) over (order by id) as expected_prev,
                         encode(sha256(convert_to(coalesce(prev_hash, '') || '|' || organization_id || '|' || coalesce(actor_id::text, '') || '|' || action || '|' ||
                           coalesce(entity_type, '') || '|' || coalesce(entity_id::text, '') || '|' || details::text || '|' || to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex') as recomputed
                    from masak.audit_events where organization_id = $1)
       select count(*) filter (where hash <> recomputed or prev_hash is distinct from expected_prev)::int as broken, count(*)::int as total from c`,
      [ctx.org.organizationId]);
    return r[0];
  });
}

// ---------- Kurallar ----------
export async function listRules(ctx: Ctx) {
  ctx.need('records.read');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select r.id, r.organization_id, r.rule_key, r.version, r.title, r.scope, r.kind, r.level, r.threshold_kurus::text as threshold, r.params,
              r.valid_from::text, r.valid_to::text, r.source_url, r.source_article, r.last_verified_at::text, r.legal_review_required, r.status,
              r.approved_at, pa.full_name as approved_by_name, pc.full_name as created_by_name, r.notes
         from masak.compliance_rules r left join masak.profiles pa on pa.id = r.approved_by left join masak.profiles pc on pc.id = r.created_by
        where r.organization_id is null or r.organization_id = $1 order by r.rule_key, r.version`,
      [ctx.org.organizationId]),
  );
}

export const INDICATORS = {
  possible_linked: 'Olası bağlantılı işlem',
  below_threshold_repeat: 'Eşik altı tekrar',
  large_cash: 'Eşik üstü nakit',
  on_behalf_without_representative: 'Temsil bilgisi eksik',
  large_scrap: 'Yüksek hurda alışı',
  quick_resale: 'Hızlı geri satış',
} as const;

export const ruleDraftSchema = z.object({
  indicator: z.enum(Object.keys(INDICATORS) as [keyof typeof INDICATORS]),
  level: z.enum(['info', 'review', 'high']),
  window_days: z.coerce.number().int().min(1).max(90).optional(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Başlangıç tarihi gerekli.'),
  notes: z.string().trim().min(10, 'Gerekçe/kaynak notu gerekli.').max(2000),
});

/**
 * İşletmeye özel kurallar yalnızca iç risk göstergeleridir. Yasal eşikler kod incelemesi, test ve migration
 * ile değişir; internetten otomatik kural üretilmez. Taslak → onay (rules.approve) → aktif.
 */
export async function draftRule(ctx: Ctx, input: unknown) {
  ctx.need('rules.manage');
  const v = ruleDraftSchema.parse(input);
  return ctx.db(async (sql) => {
    const key = `ORG-${v.indicator.toUpperCase().replace(/_/g, '-')}`;
    const version = (await sql.query<{ v: number }>('select coalesce(max(version), 0) + 1 as v from masak.compliance_rules where organization_id = $1 and rule_key = $2', [ctx.org.organizationId, key]))[0].v;
    const r = await sql.query<{ id: string }>(
      `insert into masak.compliance_rules (organization_id, rule_key, version, title, scope, kind, level, params, valid_from, source_url, source_article, last_verified_at, legal_review_required, status, created_by, notes)
       values ($1, $2, $3, $4, 'İşletme iç politikası', 'risk_indicator', $5, $6::jsonb, $7, $8, 'İşletme iç kontrol politikası', current_date, true, 'draft', masak.uid(), $9) returning id`,
      [ctx.org.organizationId, key, version, `İç gösterge: ${INDICATORS[v.indicator]}`, v.level, JSON.stringify({ indicator: v.indicator, windowDays: v.window_days ?? 7 }),
        v.valid_from, `${raporConfig().url}/masak-raporu/ayarlar/kurallar`, v.notes],
    );
    await audit(sql, ctx.org.organizationId, 'rule.drafted', 'compliance_rules', r[0].id, { key, version });
  });
}

export async function setRuleStatus(ctx: Ctx, id: string, status: 'approved' | 'active' | 'retired', testConfirmed: boolean) {
  ctx.need(status === 'retired' ? 'rules.manage' : 'rules.approve');
  if (status !== 'retired' && !testConfirmed) throw new AppError('TEST_REQUIRED', 'Kuralı onaylamadan önce örnek işlemlerle test edildiğini teyit edin.');
  return ctx.db(async (sql) => {
    const r = await sql.query<{ id: string }>(
      `update masak.compliance_rules set status = $3,
              approved_by = case when $3 in ('approved','active') then coalesce(approved_by, masak.uid()) else approved_by end,
              approved_at = case when $3 in ('approved','active') then coalesce(approved_at, now()) else approved_at end,
              valid_to = case when $3 = 'retired' then current_date else valid_to end
        where id = $1 and organization_id = $2
          and ((status = 'draft' and $3 = 'approved') or (status = 'approved' and $3 = 'active') or (status in ('approved','active') and $3 = 'retired'))
        returning id`,
      [id, ctx.org.organizationId, status],
    );
    if (!r[0]) throw new AppError('INVALID_TRANSITION', 'Kural bu duruma geçirilemez (taslak → onaylı → aktif).');
    await audit(sql, ctx.org.organizationId, status === 'active' ? 'rule.activated' : 'rule.approved', 'compliance_rules', id, { status });
  });
}

// ---------- İşletme ve saklama ----------
export async function organization(ctx: Ctx) {
  return ctx.db(async (sql) => ({
    org: (await sql.query<Record<string, unknown>>('select * from masak.organizations where id = $1', [ctx.org.organizationId]))[0],
    retention: await sql.query<Record<string, unknown>>(
      `select r.*, p.full_name as approved_by_name from masak.data_retention_policies r left join masak.profiles p on p.id = r.approved_by where r.organization_id = $1 order by entity_type`,
      [ctx.org.organizationId]),
  }));
}

export const orgSchema = z.object({
  name: z.string().trim().min(2).max(200),
  legal_name: z.string().trim().max(250).optional(),
  tax_number: z.string().trim().max(11).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(30).optional(),
});

export async function updateOrganization(ctx: Ctx, input: unknown) {
  ctx.need('settings.manage');
  const v = orgSchema.parse(input);
  return ctx.db(async (sql) => {
    await sql.query('update masak.organizations set name = $2, legal_name = $3, tax_number = $4, address = $5, phone = $6 where id = $1', [
      ctx.org.organizationId, v.name, v.legal_name || null, v.tax_number || null, v.address || null, v.phone || null]);
    await audit(sql, ctx.org.organizationId, 'organization.updated', 'organizations', ctx.org.organizationId);
  });
}

export async function updateRetention(ctx: Ctx, entity: string, years: number, basis: string, approve: boolean) {
  ctx.need('settings.manage');
  const v = z.object({ entity: z.enum(['customers', 'transactions', 'documents', 'risk_cases', 'audit_events', 'reports']), years: z.number().int().min(1).max(50), basis: z.string().trim().min(10).max(1000) }).parse({ entity, years, basis });
  return ctx.db(async (sql) => {
    await sql.query(
      `insert into masak.data_retention_policies (organization_id, entity_type, retention_years, basis, legal_review_status, approved_by)
       values ($1, $2, $3, $4, $5, case when $5 = 'approved' then masak.uid() end)
       on conflict (organization_id, entity_type) do update set retention_years = excluded.retention_years, basis = excluded.basis,
         legal_review_status = excluded.legal_review_status, approved_by = excluded.approved_by, updated_at = now()`,
      [ctx.org.organizationId, v.entity, v.years, v.basis, approve ? 'approved' : 'pending']);
    await audit(sql, ctx.org.organizationId, 'retention.updated', 'data_retention_policies', null, { entity: v.entity, years: v.years, approved: approve });
  });
}

export function integrations() {
  const local = raporConfig().local;
  return [
    { name: 'Veritabanı', status: local ? 'Yerel PGlite (demo/test)' : 'Supabase Postgres (RLS)', ok: true },
    { name: 'Kimlik doğrulama', status: local ? 'Yerel parola + TOTP (demo)' : 'Supabase Auth + TOTP MFA (aal2)', ok: true },
    { name: 'Belge deposu', status: local ? 'Yerel şifreli dosya' : 'Supabase Storage özel kova (şifreli içerik)', ok: true },
    { name: 'OCR', status: 'Tesseract.js — tarayıcıda çalışır, görüntü sunucuya/üçüncü tarafa gönderilmez', ok: true },
    { name: 'E-posta bildirimleri', status: 'Bağlı değil — davet bağlantısı panelden kopyalanır', ok: false },
    { name: 'Muhasebe programı', status: 'Yalnızca CSV içe aktarma; API adaptörü tanımlı değil', ok: false },
    { name: 'MASAK Online', status: 'Entegrasyon yok. Resmi bildirim yetkili kişi tarafından MASAK Online üzerinden yapılır.', ok: false },
  ];
}
