import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { connection } from './supabase-connection.mjs';

const { sql } = connection();
try {
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort()) {
    const version = file.split('_')[0];
    const source = readFileSync(`supabase/migrations/${file}`, 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    const applied = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(685019324)`;
      await tx.unsafe(`
      create schema if not exists nostos_ops;
      revoke all on schema nostos_ops from public, anon, authenticated;
      create table if not exists nostos_ops.migrations (
        version text primary key, checksum text not null, applied_at timestamptz not null default now()
      );
      alter table nostos_ops.migrations enable row level security;
      revoke all on nostos_ops.migrations from public, anon, authenticated;
    `);
      const previous =
        await tx`select checksum from nostos_ops.migrations where version=${version}`;
      if (previous.length) {
        if (previous[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH');
        return false;
      }
      const existing = await tx`select to_regclass('public.applications') as name`;
      if (version === '202610210001' && existing[0].name)
        throw new Error('EXISTING_SCHEMA_REQUIRES_REVIEW');
      await tx.unsafe(source);
      await tx`insert into nostos_ops.migrations(version,checksum) values(${version},${checksum})`;
      return true;
    });
    console.log(
      applied
        ? 'Migration uygulandı (TLS doğrulandı).'
        : 'Migration zaten uygulanmış; checksum doğrulandı.',
    );
  }
} catch (error) {
  console.error('MIGRATION_FAILED', error.code || 'CHECK_FAILED');
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 3 });
}
