import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';
function secret(name: string) {
  const c = config('admin');
  if (process.env[name]) {
    const b = Buffer.from(process.env[name]!, 'base64');
    if (b.length !== 32) throw new Error('INVALID_SECRET');
    return b;
  }
  if (!c.local) throw new Error('SECRET_REQUIRED');
  mkdirSync(c.dataDir, { recursive: true });
  const path = join(c.dataDir, `${name}.key`);
  try {
    return readFileSync(path);
  } catch {
    const key = randomBytes(32);
    try {
      writeFileSync(path, key, { mode: 0o600, flag: 'wx' });
      return key;
    } catch {
      return readFileSync(path);
    }
  }
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', secret('DATA_ENCRYPTION_KEY'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decrypt<T>(value: string): T {
  const b = Buffer.from(value, 'base64'),
    decipher = createDecipheriv('aes-256-gcm', secret('DATA_ENCRYPTION_KEY'), b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString(),
  ) as T;
}
export function signToken(data: Record<string, unknown>, lifetime = 900) {
  const body = Buffer.from(
    JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + lifetime }),
  ).toString('base64url');
  return `${body}.${createHmac('sha256', secret('TOKEN_SECRET')).update(body).digest('base64url')}`;
}
export function verifyToken<T>(token: string, purpose: string): T {
  try {
    const [body, sig] = token.split('.');
    const expected = createHmac('sha256', secret('TOKEN_SECRET')).update(body).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw 0;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (data.purpose !== purpose || data.exp <= Date.now() / 1000) throw 0;
    return data as T;
  } catch {
    throw new Error('INVALID_TOKEN');
  }
}
export function privateHash(value: string) {
  return createHmac('sha256', secret('TOKEN_SECRET')).update(value).digest('hex');
}
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
