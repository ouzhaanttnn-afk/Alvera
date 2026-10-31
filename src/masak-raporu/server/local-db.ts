import 'server-only';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { raporConfig } from './config';
import type { Driver } from './db';

// Yalnızca yerel/demo ve test ortamı: gerçek PostgreSQL (PGlite/WASM) üzerinde aynı migration'lar ve RLS.
// Supabase'te bulunan rol ve auth şeması burada taklit edilir; yerel kimlik doğrulama tabloları ayrı şemadadır.
const STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text unique not null, created_at timestamptz not null default now());
`;
const LOCAL_AUTH = `
create schema masak_local;
revoke all on schema masak_local from public;
create table masak_local.credentials (
  user_id uuid primary key references auth.users (id),
  password_hash text not null,
  totp_secret_enc text,
  totp_enabled boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz
);
create table masak_local.sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
`;
export const MIGRATIONS = ['20261031120000_masak_raporu.sql', '20261031120100_masak_raporu_rules.sql'];

export function migrationSql() {
  const dir = resolve(/* turbopackIgnore: true */ process.cwd(), 'supabase/migrations');
  return MIGRATIONS.map((f) => readFileSync(join(dir, f), 'utf8'));
}

type PG = import('@electric-sql/pglite').PGlite;

export async function createLocalDatabase(dataDir?: string): Promise<PG> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const ready = await pg.query<{ ok: boolean }>(`select exists (select 1 from pg_namespace where nspname = 'masak_local') as ok`);
  if (!ready.rows[0].ok) {
    await pg.exec(STUBS);
    for (const sql of migrationSql()) await pg.exec(sql);
    await pg.exec(LOCAL_AUTH);
  }
  return pg;
}

export function wrap(pg: PG): Driver {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    // PGlite tek bağlantılıdır; işlemler sırayla yürütülür.
    transaction: <T,>(fn: Parameters<Driver['transaction']>[0]) => {
      const run = queue.then(() =>
        pg.transaction(async (tx) => fn({ query: async (text, params) => (await tx.query(text, params as unknown[])).rows as never })),
      );
      queue = run.catch(() => undefined);
      return run as Promise<T>;
    },
    close: () => pg.close(),
  };
}

export async function localDriver(): Promise<Driver> {
  const c = raporConfig();
  const memory = process.env.MASAK_RAPORU_DB === 'memory';
  const pg = await createLocalDatabase(memory ? undefined : join(c.dataDir, 'masak-raporu', 'pgdata'));
  return wrap(pg);
}
