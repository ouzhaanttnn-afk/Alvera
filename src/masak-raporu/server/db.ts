import 'server-only';
import { raporConfig } from './config';

export type Row = Record<string, unknown>;
export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Driver {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const g = globalThis as unknown as { __masakRaporuDriver?: Promise<Driver> };

/** Testlerde kullanılmak üzere sürücüyü değiştirme. */
export function setDriver(d: Promise<Driver> | undefined) {
  g.__masakRaporuDriver = d;
}

async function createDriver(): Promise<Driver> {
  const c = raporConfig();
  if (c.local) {
    const { localDriver } = await import('./local-db');
    return localDriver();
  }
  const { default: postgres } = await import('postgres');
  // Supavisor işlem modu ile uyumlu: hazırlanmış ifade yok, TLS zorunlu.
  const client = postgres(c.databaseUrl!, { prepare: false, ssl: 'require', max: 3, idle_timeout: 20, connect_timeout: 10 });
  return {
    transaction: (fn) =>
      client.begin(async (tx) => fn({ query: async (text, params = []) => (await tx.unsafe(text, params as never[])) as never })) as never,
    close: () => client.end(),
  };
}

export function driver(): Promise<Driver> {
  return (g.__masakRaporuDriver ||= createDriver().catch((e) => {
    g.__masakRaporuDriver = undefined;
    throw e;
  }));
}

/**
 * Kullanıcı bağlamında işlem: rol "authenticated", JWT talepleri kullanıcı kimliğiyle ayarlanır.
 * Bu sayede tüm sorgular veritabanındaki RLS politikalarına tabidir.
 */
export async function asUser<T>(userId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/.test(userId)) throw new Error('INVALID_USER');
  return (await driver()).transaction(async (sql) => {
    await sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    await sql.query('set local role authenticated');
    return fn(sql);
  });
}

/** Sistem bağlamı: yalnızca giriş, davet kabulü, hız sınırı ve kurulum gibi oturum öncesi işlemler için. */
export async function asSystem<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return (await driver()).transaction(fn);
}
