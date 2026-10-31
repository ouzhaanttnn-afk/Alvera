import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { raporConfig } from './config';

const cache = new Map<string, Buffer>();
function master(name: 'DATA_ENCRYPTION_KEY' | 'TOKEN_SECRET'): Buffer {
  const hit = cache.get(name);
  if (hit) return hit;
  let key: Buffer;
  if (process.env[name]) {
    key = Buffer.from(process.env[name]!, 'base64');
    if (key.length !== 32) throw new Error('INVALID_SECRET');
  } else {
    const c = raporConfig();
    if (!c.local) throw new Error('SECRET_REQUIRED');
    mkdirSync(c.dataDir, { recursive: true });
    const path = join(c.dataDir, `masak-raporu-${name}.key`);
    try {
      key = readFileSync(path);
    } catch {
      key = randomBytes(32);
      try {
        writeFileSync(path, key, { mode: 0o600, flag: 'wx' });
      } catch {
        key = readFileSync(path);
      }
    }
  }
  cache.set(name, key);
  return key;
}
function derived(info: string) {
  const id = `derived:${info}`;
  if (!cache.has(id)) cache.set(id, Buffer.from(hkdfSync('sha256', master('DATA_ENCRYPTION_KEY'), 'alvera-masak-raporu', info, 32)));
  return cache.get(id)!;
}

/** Hassas alan şifreleme (AES-256-GCM, alan bağlamı AAD olarak bağlanır). */
export function encryptField(plain: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derived('field-v1'), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}
export function decryptField(value: string, context: string): string {
  if (!value.startsWith('v1:')) throw new Error('UNSUPPORTED_CIPHER');
  const b = Buffer.from(value.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', derived('field-v1'), b.subarray(0, 12));
  d.setAAD(Buffer.from(context));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
/** Mükerrer müşteri kontrolü için tek yönlü, işletmeye bağlı anahtarlı özet. */
export function identifierHash(organizationId: string, value: string): string {
  return createHmac('sha256', derived('identifier-v1')).update(`${organizationId}:${value.replace(/\s/g, '').toUpperCase()}`).digest('hex');
}

/** Dosya içeriği şifreleme (depolamaya yalnızca şifreli bayt gider). */
export function encryptBlob(data: Uint8Array, context: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derived('blob-v1'), iv);
  cipher.setAAD(Buffer.from(context));
  return Buffer.concat([iv, Buffer.concat([cipher.update(data), cipher.final()]), cipher.getAuthTag()]);
}
export function decryptBlob(data: Uint8Array, context: string): Buffer {
  const b = Buffer.from(data);
  const d = createDecipheriv('aes-256-gcm', derived('blob-v1'), b.subarray(0, 12));
  d.setAAD(Buffer.from(context));
  d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]);
}

export function sign(data: Record<string, unknown>, lifetimeSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds })).toString('base64url');
  return `${body}.${createHmac('sha256', master('TOKEN_SECRET')).update(`mr:${body}`).digest('base64url')}`;
}
export function verify<T extends Record<string, unknown>>(token: string, purpose: string): T {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) throw new Error('INVALID_TOKEN');
  const expected = createHmac('sha256', master('TOKEN_SECRET')).update(`mr:${body}`).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('INVALID_TOKEN');
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (data.purpose !== purpose || data.exp <= Date.now() / 1000) throw new Error('INVALID_TOKEN');
  return data as T;
}

export const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export function privateKeyHash(value: string) {
  return createHmac('sha256', master('TOKEN_SECRET')).update(`rate:${value}`).digest('hex');
}
