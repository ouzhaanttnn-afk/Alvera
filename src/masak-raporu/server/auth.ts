import 'server-only';
import { randomUUID, scrypt as scryptCb, timingSafeEqual, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Role } from '../permissions';
import { audit } from './audit';
import { raporConfig } from './config';
import { asSystem, asUser, type Sql } from './db';
import { AppError } from './errors';
import { decryptField, encryptField, privateKeyHash, randomToken, sha256, sign, verify } from './keys';
import { cookieOptions, ORG_COOKIE, SESSION_COOKIE, supabaseAuth, type Ctx } from './session';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp';

const scrypt = promisify(scryptCb) as (p: string, s: Buffer, l: number, o: object) => Promise<Buffer>;
const PENDING_COOKIE = 'mr_pending';
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export const passwordSchema = z
  .string()
  .min(12, 'Parola en az 12 karakter olmalı.')
  .max(200)
  .refine((p) => /[a-zçğıöşü]/.test(p) && /[A-ZÇĞİÖŞÜ]/.test(p) && /\d/.test(p), 'Parola büyük harf, küçük harf ve rakam içermeli.');

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
async function checkPassword(password: string, stored: string) {
  const [, N, r, p, salt, hash] = stored.split('$');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), 32, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  const expected = Buffer.from(hash, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function rateLimit(key: string, limit: number, seconds: number) {
  const ok = await asSystem(async (sql) => (await sql.query<{ ok: boolean }>('select masak.hit_rate($1, $2, $3) as ok', [privateKeyHash(key), limit, seconds]))[0].ok);
  if (!ok) throw new AppError('RATE_LIMITED', 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.', 429);
}

const LOGIN_FAILED = new AppError('LOGIN_FAILED', 'E-posta, parola veya doğrulama kodu hatalı.', 401);

export type PasswordStep = { step: 'mfa' } | { step: 'enroll'; secret: string; uri: string; qr?: string };

/** 1. adım: e-posta + parola. Başarılıysa ikinci faktör adımına geçilir (oturum henüz açılmaz). */
export async function passwordStep(email: string, password: string, client: string): Promise<PasswordStep> {
  await rateLimit(`login:${client}`, 30, 900);
  await rateLimit(`login-email:${email.toLowerCase()}`, 8, 900);
  return raporConfig().local ? localPasswordStep(email, password) : supabasePasswordStep(email, password);
}

async function localPasswordStep(email: string, password: string): Promise<PasswordStep> {
  const row = await asSystem(async (sql) => {
    const r = await sql.query<{ id: string; password_hash: string; totp_enabled: boolean; totp_secret_enc: string | null; locked: boolean }>(
      `select u.id, c.password_hash, c.totp_enabled, c.totp_secret_enc, coalesce(c.locked_until > now(), false) as locked
         from auth.users u join masak_local.credentials c on c.user_id = u.id where lower(u.email) = lower($1)`,
      [email],
    );
    return r[0];
  });
  // Kullanıcı yoksa da aynı sürede yanıt vermek için sahte doğrulama.
  const ok = row ? !row.locked && (await checkPassword(password, row.password_hash)) : (await hashPassword(password), false);
  if (!row || !ok) {
    if (row)
      await asSystem((sql) =>
        sql.query(
          `update masak_local.credentials set failed_attempts = failed_attempts + 1,
             locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
           where user_id = $1`,
          [row.id],
        ),
      );
    throw LOGIN_FAILED;
  }
  const jar = await cookies();
  if (row.totp_enabled) {
    jar.set(PENDING_COOKIE, sign({ purpose: 'mfa', uid: row.id }, 300), cookieOptions(300));
    return { step: 'mfa' };
  }
  const secret = newTotpSecret();
  jar.set(PENDING_COOKIE, sign({ purpose: 'enroll', uid: row.id, s: encryptField(secret, `totp-pending:${row.id}`) }, 600), cookieOptions(600));
  return { step: 'enroll', secret, uri: otpauthUri(secret, email) };
}

async function supabasePasswordStep(email: string, password: string): Promise<PasswordStep> {
  const client = await supabaseAuth();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw LOGIN_FAILED;
  const member = await asSystem((sql) => sql.query('select 1 from masak.organization_members where user_id = $1 and active', [data.user.id]));
  if (!member.length) {
    await client.auth.signOut();
    throw LOGIN_FAILED;
  }
  const { data: factors, error: fe } = await client.auth.mfa.listFactors();
  if (fe) throw new AppError('MFA_UNAVAILABLE', 'İkinci doğrulama hizmetine ulaşılamadı.', 503);
  const verified = factors.totp.find((f) => f.status === 'verified');
  const jar = await cookies();
  if (verified) {
    jar.set(PENDING_COOKIE, sign({ purpose: 'mfa', uid: data.user.id, f: verified.id }, 300), cookieOptions(300));
    return { step: 'mfa' };
  }
  for (const f of factors.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')) await client.auth.mfa.unenroll({ factorId: f.id });
  const { data: factor, error: ee } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ALVERA MASAK RAPORU' });
  if (ee || !factor) throw new AppError('MFA_UNAVAILABLE', 'İkinci doğrulama hizmetine ulaşılamadı.', 503);
  jar.set(PENDING_COOKIE, sign({ purpose: 'enroll', uid: data.user.id, f: factor.id }, 600), cookieOptions(600));
  return { step: 'enroll', secret: factor.totp.secret, uri: factor.totp.uri, qr: factor.totp.qr_code };
}

/** 2. adım: TOTP kodu. Başarılıysa oturum açılır. */
export async function mfaStep(code: string, client: string) {
  await rateLimit(`mfa:${client}`, 30, 900);
  const jar = await cookies();
  const raw = jar.get(PENDING_COOKIE)?.value || '';
  let pending: { uid: string; purpose: string; s?: string; f?: string };
  try {
    pending = verify(raw, 'mfa');
  } catch {
    try {
      pending = verify(raw, 'enroll');
    } catch {
      throw new AppError('LOGIN_EXPIRED', 'Doğrulama süresi doldu. Lütfen yeniden giriş yapın.', 401);
    }
  }
  await rateLimit(`mfa-user:${pending.uid}`, 10, 900);
  if (raporConfig().local) await localMfa(pending, code);
  else {
    const client = await supabaseAuth();
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: pending.f!, code });
    if (error) throw LOGIN_FAILED;
  }
  jar.set(PENDING_COOKIE, '', cookieOptions(0));
  await asSystem(async (sql) => {
    await sql.query('update masak.profiles set last_sign_in_at = now() where id = $1', [pending.uid]);
    await sql.query(
      `insert into masak.audit_events (organization_id, actor_id, action, entity_type, entity_id)
       select organization_id, $1, 'auth.login', 'profiles', $1 from masak.organization_members where user_id = $1 and active`,
      [pending.uid],
    );
  });
}

async function localMfa(pending: { uid: string; purpose: string; s?: string }, code: string) {
  const secret =
    pending.purpose === 'enroll'
      ? decryptField(pending.s!, `totp-pending:${pending.uid}`)
      : await asSystem(async (sql) => {
          const r = await sql.query<{ totp_secret_enc: string }>('select totp_secret_enc from masak_local.credentials where user_id = $1', [pending.uid]);
          return decryptField(r[0].totp_secret_enc, `totp:${pending.uid}`);
        });
  if (!verifyTotp(secret, code)) throw LOGIN_FAILED;
  const token = randomToken(32);
  const hours = raporConfig().sessionHours;
  await asSystem(async (sql) => {
    if (pending.purpose === 'enroll')
      await sql.query('update masak_local.credentials set totp_secret_enc = $2, totp_enabled = true where user_id = $1', [
        pending.uid,
        encryptField(secret, `totp:${pending.uid}`),
      ]);
    await sql.query('update masak_local.credentials set failed_attempts = 0, locked_until = null where user_id = $1', [pending.uid]);
    await sql.query(`insert into masak_local.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(hours => $3))`, [sha256(token), pending.uid, hours]);
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(hours * 3600));
}

export async function logout(ctx: Ctx | null) {
  const jar = await cookies();
  if (ctx) await ctx.db((sql) => audit(sql, ctx.org.organizationId, 'auth.logout', 'profiles', ctx.user.id));
  if (raporConfig().local) {
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) await asSystem((sql) => sql.query('update masak_local.sessions set revoked_at = now() where token_hash = $1', [sha256(token)]));
  } else await (await supabaseAuth()).auth.signOut();
  jar.set(SESSION_COOKIE, '', cookieOptions(0));
  jar.set(ORG_COOKIE, '', cookieOptions(0));
}

// ---------- Davet ----------
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Geçerli bir e-posta girin.').max(254),
  role: z.enum(['owner', 'manager', 'compliance_officer', 'staff', 'auditor']),
});

/** Davet bağlantısı yalnızca bir kez gösterilir; veritabanında yalnızca özeti saklanır. */
export async function createInvitation(ctx: Ctx, input: z.infer<typeof inviteSchema>) {
  ctx.need('members.manage');
  const token = randomToken(32);
  await ctx.db(async (sql) => {
    const r = await sql.query<{ id: string }>(
      `insert into masak.invitations (organization_id, email, role, token_hash, expires_at, created_by)
       values ($1, $2, $3, $4, now() + interval '72 hours', masak.uid()) returning id`,
      [ctx.org.organizationId, input.email, input.role, sha256(token)],
    );
    await audit(sql, ctx.org.organizationId, 'member.invited', 'invitations', r[0].id, { role: input.role });
  });
  return `${raporConfig().url}/masak-raporu/davet?t=${token}`;
}

export async function invitationInfo(token: string) {
  const rows = await asSystem((sql) =>
    sql.query<{ email: string; role: Role; organization_name: string }>(
      `select i.email, i.role, o.name as organization_name from masak.invitations i join masak.organizations o on o.id = i.organization_id
        where i.token_hash = $1 and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`,
      [sha256(token)],
    ),
  );
  return rows[0] || null;
}

export async function acceptInvitation(token: string, fullName: string, password: string, client: string) {
  await rateLimit(`invite:${client}`, 10, 900);
  passwordSchema.parse(password);
  const name = z.string().trim().min(2, 'Ad soyad gerekli.').max(120).parse(fullName);
  const local = raporConfig().local;
  await asSystem(async (sql) => {
    const inv = (
      await sql.query<{ id: string; organization_id: string; email: string; role: Role; created_by: string }>(
        `select id, organization_id, email, role, created_by from masak.invitations
          where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > now() for update`,
        [sha256(token)],
      )
    )[0];
    if (!inv) throw new AppError('INVITE_INVALID', 'Davet geçersiz veya süresi dolmuş.', 400);
    const existing = (await sql.query<{ id: string }>('select id from auth.users where lower(email) = lower($1)', [inv.email]))[0];
    let userId = existing?.id;
    if (!userId) {
      userId = local ? randomUUID() : await createSupabaseUser(inv.email, password);
      if (local) {
        await sql.query('insert into auth.users (id, email) values ($1, $2)', [userId, inv.email]);
        await sql.query('insert into masak_local.credentials (user_id, password_hash) values ($1, $2)', [userId, await hashPassword(password)]);
      }
      await sql.query('insert into masak.profiles (id, email, full_name) values ($1, $2, $3)', [userId, inv.email, name]);
    }
    await sql.query(
      `insert into masak.organization_members (organization_id, user_id, role, invited_by) values ($1, $2, $3, $4)
       on conflict (organization_id, user_id) do update set role = excluded.role, active = true`,
      [inv.organization_id, userId, inv.role, inv.created_by],
    );
    await sql.query('update masak.invitations set accepted_at = now(), accepted_user_id = $2 where id = $1', [inv.id, userId]);
    await sql.query(
      `insert into masak.audit_events (organization_id, actor_id, action, entity_type, entity_id, details) values ($1, $2, 'member.joined', 'profiles', $2, $3::jsonb)`,
      [inv.organization_id, userId, JSON.stringify({ role: inv.role })],
    );
  });
}

async function createSupabaseUser(email: string, password: string): Promise<string> {
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new AppError('USER_CREATE_FAILED', 'Kullanıcı oluşturulamadı.', 503);
  return data.user.id;
}

/** Yerel/demo kurulum ve testler için kullanıcı oluşturma (üretimde kullanılmaz). */
export async function createLocalUser(sql: Sql, email: string, fullName: string, password: string, totpSecret?: string) {
  if (!raporConfig().local) throw new Error('LOCAL_ONLY');
  const id = randomUUID();
  await sql.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  await sql.query('insert into masak_local.credentials (user_id, password_hash, totp_secret_enc, totp_enabled) values ($1, $2, $3, $4)', [
    id,
    await hashPassword(password),
    totpSecret ? encryptField(totpSecret, `totp:${id}`) : null,
    Boolean(totpSecret),
  ]);
  await sql.query('insert into masak.profiles (id, email, full_name) values ($1, $2, $3)', [id, email, fullName]);
  return id;
}

export { asUser };
