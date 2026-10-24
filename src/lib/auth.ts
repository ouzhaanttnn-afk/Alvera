import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { config } from './config';
import { equalSecret, signToken, verifyToken } from './crypto';
import { supabase } from './db';
import { HttpError } from './security';
export async function authClient() {
  config('admin');
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values)
          jar.set(name, value, {
            ...options,
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
          });
      },
    },
  });
}
export async function allowedUser(id: string) {
  const { data, error } = await supabase()
    .from('admin_users')
    .select('id')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();
  if (error || !data) throw new HttpError(403, 'ADMIN_REQUIRED');
}
export async function requireAdmin() {
  const c = config('admin');
  if (c.local) {
    const value = (await cookies()).get('nf_admin')?.value;
    if (!value) throw new HttpError(401, 'LOGIN_REQUIRED');
    verifyToken(value, 'admin');
    return { id: 'local-admin' };
  }
  const client = await authClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'LOGIN_REQUIRED');
  await allowedUser(data.user.id);
  const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || aal?.currentLevel !== 'aal2') throw new HttpError(403, 'MFA_REQUIRED');
  return { id: data.user.id };
}
export async function localPassword(password: string) {
  if (!config('admin').local) throw new HttpError(403, 'LOCAL_FORBIDDEN');
  if (!process.env.LOCAL_ADMIN_PASSWORD || !equalSecret(password, process.env.LOCAL_ADMIN_PASSWORD))
    throw new HttpError(401, 'LOGIN_FAILED');
  (await cookies()).set('nf_challenge', signToken({ purpose: 'challenge' }, 300), {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: 300,
    path: '/api/masak/auth',
  });
}
export async function localMfa(code: string) {
  if (!config('admin').local) throw new HttpError(403, 'LOCAL_FORBIDDEN');
  const jar = await cookies();
  verifyToken(jar.get('nf_challenge')?.value || '', 'challenge');
  if (!process.env.LOCAL_ADMIN_TOTP_CODE || !equalSecret(code, process.env.LOCAL_ADMIN_TOTP_CODE))
    throw new HttpError(401, 'MFA_FAILED');
  jar.set('nf_challenge', '', { maxAge: 0, path: '/api/masak/auth' });
  jar.set('nf_admin', signToken({ purpose: 'admin' }, 3600), {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: 3600,
    path: '/',
  });
}
