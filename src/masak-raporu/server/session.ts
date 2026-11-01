import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { effectivePermissions, type Permission, type Role } from '../permissions';
import { raporConfig } from './config';
import { asSystem, asUser, type Sql } from './db';
import { forbidden } from './errors';
import { sha256 } from './keys';

export const SESSION_COOKIE = 'mr_session';
export const ORG_COOKIE = 'mr_org';
const IDLE_MINUTES = 30;

export type SessionUser = { id: string; email: string; fullName: string };
export type Membership = {
  organizationId: string;
  organizationName: string;
  isDemo: boolean;
  role: Role;
  permissions: Permission[];
};
export type Ctx = {
  user: SessionUser;
  org: Membership;
  memberships: Membership[];
  can: (p: Permission) => boolean;
  need: (p: Permission) => void;
  db: <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;
};

export function cookieOptions(maxAgeSeconds?: number) {
  return { httpOnly: true, secure: !raporConfig().local, sameSite: 'strict' as const, path: '/', ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}) };
}

export async function supabaseAuth() {
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values) jar.set(name, value, { ...options, httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
        } catch {
          // Server Component içinde çerez yazılamaz; oturum yenilemesi sunucu eylemlerinde yapılır.
        }
      },
    },
  });
}

async function localUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length < 30) return null;
  return asSystem(async (sql) => {
    const rows = await sql.query<{ user_id: string; email: string; full_name: string }>(
      `update masak_local.sessions s set last_seen_at = now()
         from auth.users u join masak.profiles p on p.id = u.id
        where s.token_hash = $1 and s.user_id = u.id and s.revoked_at is null and s.expires_at > now()
          and s.last_seen_at > now() - make_interval(mins => $2)
        returning s.user_id, u.email, p.full_name`,
      [sha256(token), IDLE_MINUTES],
    );
    return rows[0] ? { id: rows[0].user_id, email: rows[0].email, fullName: rows[0].full_name } : null;
  });
}

async function supabaseUser(): Promise<SessionUser | null> {
  const client = await supabaseAuth();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return null;
  const rows = await asSystem((sql) => sql.query<{ full_name: string; email: string }>('select full_name, email from masak.profiles where id = $1', [data.user.id]));
  return rows[0] ? { id: data.user.id, email: rows[0].email, fullName: rows[0].full_name } : null;
}

export async function currentUser(): Promise<SessionUser | null> {
  try {
    return raporConfig().local ? await localUser() : await supabaseUser();
  } catch {
    return null;
  }
}

export async function memberships(userId: string): Promise<Membership[]> {
  const rows = await asUser(userId, (sql) =>
    sql.query<{ organization_id: string; name: string; is_demo: boolean; role: Role; granted: string[]; revoked: string[] }>(
      `select m.organization_id, o.name, o.is_demo, m.role, m.granted, m.revoked
         from masak.organization_members m join masak.organizations o on o.id = m.organization_id
        where m.user_id = masak.uid() and m.active and o.status = 'active' order by o.created_at`,
    ),
  );
  return rows.map((r) => ({
    organizationId: r.organization_id,
    organizationName: r.name,
    isDemo: r.is_demo,
    role: r.role,
    permissions: [...effectivePermissions(r.role, r.granted, r.revoked)],
  }));
}

export function buildCtx(user: SessionUser, list: Membership[], orgId?: string): Ctx | null {
  const org = list.find((m) => m.organizationId === orgId) || list[0];
  if (!org) return null;
  const set = new Set(org.permissions);
  return {
    user,
    org,
    memberships: list,
    can: (p) => set.has(p),
    need: (p) => {
      if (!set.has(p)) throw forbidden();
    },
    db: (fn) => asUser(user.id, fn),
  };
}

/** Route handler ve eylemler için: oturum yoksa null. */
export async function getCtx(): Promise<Ctx | null> {
  raporConfig();
  const user = await currentUser();
  if (!user) return null;
  return buildCtx(user, await memberships(user.id), (await cookies()).get(ORG_COOKIE)?.value);
}

/** Sayfalar için: oturum yoksa giriş sayfasına yönlendirir; izin yoksa 403 sayfası gösterilir. */
export async function requireCtx(perm?: Permission): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/masak-raporu/giris');
  if (perm && !ctx.can(perm)) redirect('/masak-raporu/yetkisiz');
  return ctx;
}

export async function clientKey(): Promise<string> {
  const h = await headers();
  const header = process.env.TRUSTED_IP_HEADER;
  return header ? h.get(header) || 'unknown' : 'global';
}
