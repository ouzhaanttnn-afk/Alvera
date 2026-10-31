import 'server-only';
import { resolve } from 'node:path';

export type RaporConfig = {
  local: boolean;
  url: string;
  dataDir: string;
  databaseUrl?: string;
  maxUploadBytes: number;
  sessionHours: number;
};

/**
 * Yerel mod: APP_MODE=local (veya geliştirme). Veritabanı yerel PGlite, kimlik doğrulama yerel (scrypt + TOTP).
 * Üretim: Supabase Postgres (MASAK_DATABASE_URL) + Supabase Auth (aal2 MFA) + özel Storage kovası.
 * Üretimde eksik yapılandırma varsa modül tamamen kapalı kalır (fail-closed).
 */
export function raporConfig(): RaporConfig {
  const local = process.env.APP_MODE === 'local' || (!process.env.APP_MODE && process.env.NODE_ENV !== 'production');
  if (local && process.env.NODE_ENV === 'production' && process.env.MASAK_RAPORU_ALLOW_LOCAL_BUILD !== 'true')
    throw new Error('LOCAL_MODE_FORBIDDEN');
  const c: RaporConfig = {
    local,
    url: process.env.APP_URL || 'http://127.0.0.1:3000',
    dataDir: resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || '.local'),
    databaseUrl: process.env.MASAK_DATABASE_URL,
    maxUploadBytes: Math.min(Number(process.env.MASAK_RAPORU_MAX_UPLOAD_MB || 10), 10) * 1024 * 1024,
    sessionHours: Math.min(Number(process.env.MASAK_RAPORU_SESSION_HOURS || 8), 12),
  };
  if (!local) {
    if (process.env.MASAK_RAPORU_ENABLED !== 'true') throw new Error('MODULE_DISABLED');
    for (const key of ['MASAK_DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATA_ENCRYPTION_KEY', 'TOKEN_SECRET', 'APP_URL'])
      if (!process.env[key]) throw new Error(`CONFIG_MISSING_${key}`);
    if (!c.url.startsWith('https://')) throw new Error('HTTPS_REQUIRED');
  }
  return c;
}

export function moduleAvailable(): { ok: true } | { ok: false; reason: string } {
  try {
    raporConfig();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'UNAVAILABLE' };
  }
}
