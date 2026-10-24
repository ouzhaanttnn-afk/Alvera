import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import postgres from 'postgres';

export function connection() {
  const [envPath, caPath, expectedRef] = process.argv.slice(2);
  if (!envPath || !caPath || !/^[a-z]{20}$/.test(expectedRef || ''))
    throw new Error('ENV_CA_EXPECTED_PROJECT_REQUIRED');
  const env = parseEnv(readFileSync(envPath, 'utf8'));
  const api = new URL(env.SUPABASE_URL);
  const url = new URL(env.POSTGRES_URL_NON_POOLING);
  if (
    api.protocol !== 'https:' ||
    api.hostname !== `${expectedRef}.supabase.co` ||
    decodeURIComponent(url.username) !== `postgres.${expectedRef}` ||
    !url.hostname.endsWith('.pooler.supabase.com') ||
    url.port !== '5432'
  )
    throw new Error('PROJECT_SCOPE_MISMATCH');
  // CA and hostname verification stay enabled; never trust a password over unverified TLS.
  const sql = postgres(url.toString(), {
    ssl: { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true },
    max: 1,
    connect_timeout: 15,
    onnotice: () => {},
  });
  return { env, sql, expectedRef };
}
