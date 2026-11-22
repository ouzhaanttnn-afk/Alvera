// Mağaza paneli: tek seferlik şifre sıfırlama (yerel depolama, sentetik şifreler).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'alvera-reset-'));
process.env.ALPERA_LOCAL_STORAGE = '1';
process.env.ALPERA_DATA_DIR = dir;
delete process.env.VERCEL;

let security: any;
beforeAll(async () => {
  // @ts-ignore tip bildirimi olmayan düz JavaScript modülü
  security = await import('../lib/security.js');
});
afterEach(() => { delete process.env.ADMIN_PASSWORD_RESET; });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const req = () => ({ headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000', 'x-forwarded-for': '10.0.0.1' }, socket: {} });
const res = () => ({ setHeader: () => {} });
const resetValue = (password: string, salt = 'ab'.repeat(24)) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const login = (password: string, username = 'alvera') => security.login(req(), res(), { username, password });

it('sıfırlama değeri yeni şifreyi bir kez kurar; şifre değişince eski sıfırlama geri gelmez', async () => {
  process.env.ADMIN_PASSWORD_RESET = resetValue('Yeni-Sifre-Test-123');
  await expect(login('yanlis-sifre-deneme')).rejects.toThrow('doğru değil');
  const first = await login('Yeni-Sifre-Test-123');
  expect(first.username).toBe('alvera');

  await security.changePassword(req(), res(), { username: 'alvera' }, { currentPassword: 'Yeni-Sifre-Test-123', password: 'Sahibin-Kendi-Sifresi-9' });
  // Aynı sıfırlama değeri hâlâ tanımlı olsa da yeniden uygulanmaz.
  await expect(login('Yeni-Sifre-Test-123')).rejects.toThrow('doğru değil');
  expect((await login('Sahibin-Kendi-Sifresi-9')).username).toBe('alvera');
});

it('biçimi bozuk sıfırlama değeri yok sayılır', async () => {
  process.env.ADMIN_PASSWORD_RESET = 'duz-metin-sifre';
  await expect(login('duz-metin-sifre')).rejects.toThrow('doğru değil');
  expect((await login('Sahibin-Kendi-Sifresi-9')).username).toBe('alvera');
});
