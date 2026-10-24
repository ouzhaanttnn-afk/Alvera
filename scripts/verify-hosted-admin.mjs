import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { connection } from './supabase-connection.mjs';

const { env, sql } = connection();
const origin = process.argv[5];
if (!process.env.EXPECTED_PREVIEW_ORIGIN || origin !== process.env.EXPECTED_PREVIEW_ORIGIN)
  throw new Error('EXPECTED_PREVIEW_ORIGIN_REQUIRED');
const cookies = (
  process.env.PREVIEW_COOKIE_JAR ? readFileSync(process.env.PREVIEW_COOKIE_JAR, 'utf8') : ''
)
  .split(/\r?\n/)
  .filter((line) => line && (!line.startsWith('#') || line.startsWith('#HttpOnly_')))
  .map((line) => line.replace(/^#HttpOnly_/, '').split('\t'))
  .filter((parts) => parts[5] === '_vercel_jwt')
  .map((parts) => ({
    name: parts[5],
    value: parts[6],
    domain: new URL(origin).hostname,
    path: '/',
    expires: Number(parts[4]),
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }));
const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: origin,
  storageState: { cookies, origins: [] },
});
const http = context.request;
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let userId;
const checks = [];
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, ''))
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
}
async function post(path, data, from = origin) {
  return http.post(path, { headers: { origin: from }, data });
}
try {
  const page = await http.get('/masak-form/admin');
  assert.equal(page.status(), 200);
  assert(!(await page.text()).includes('Yönetim henüz açılmadı'));
  assert.equal((await http.get('/api/masak/admin/session')).status(), 401);
  assert.equal(
    (await post('/api/masak/auth/password', {}, 'https://evil.example.invalid')).status(),
    403,
  );
  checks.push('Yönetici kurulum ekranı açık; oturumsuz erişim ve CSRF reddediliyor');
  const email = `nf-qa-${randomUUID()}@example.invalid`,
    password = `${randomBytes(27).toString('base64url')}aA1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null);
  userId = created.data.user.id;
  assert.equal((await post('/api/masak/auth/password', { email, password })).status(), 403);
  checks.push('Gerçek Supabase kullanıcısı izin listesi olmadan uygulamaya alınmıyor');
  await sql`insert into admin_users(id,active) values(${userId},true)`;
  const ui = await context.newPage();
  await ui.goto('/masak-form/admin');
  await ui.getByLabel('E-posta', { exact: true }).fill(email);
  await ui.getByLabel('Parola', { exact: true }).fill(password);
  const [login] = await Promise.all([
    ui.waitForResponse(
      (r) => r.url().endsWith('/api/masak/auth/password') && r.request().method() === 'POST',
    ),
    ui.getByRole('button', { name: 'Güvenli giriş', exact: true }).click(),
  ]);
  assert.equal(login.status(), 200);
  const factor = await login.json();
  assert(factor.secret);
  assert(factor.factorId);
  assert(factor.qr);
  const qrImage = ui.getByAltText('Kimlik doğrulayıcıya eklenecek TOTP QR kodu');
  await expect(qrImage).toBeVisible();
  await expect.poll(() => qrImage.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
  checks.push('Gerçek Supabase MFA QR görseli tarayıcıda decode edildi');
  const before = await http.get('/api/masak/admin/session');
  assert.equal(before.status(), 403);
  assert.equal((await before.json()).error, 'MFA_REQUIRED');
  assert.equal(
    (
      await post(`/api/masak/admin/applications/${randomUUID()}`, { action: 'note', note: 'sentetik' })
    ).status(),
    403,
  );
  checks.push('Parola tek başına yeterli değil: AAL1 okuma/yazma reddediliyor');
  const verified = await post('/api/masak/auth/mfa', {
    factorId: factor.factorId,
    code: totp(factor.secret),
  });
  assert.equal(verified.status(), 200);
  const session = await http.get('/api/masak/admin/session');
  assert.equal(session.status(), 200);
  assert.equal((await session.json()).id, userId);
  assert.equal((await http.get('/api/masak/admin/applications')).status(), 200);
  checks.push('Sentetik yönetici için gerçek TOTP kaydı, doğrulaması ve AAL2 API erişimi başarılı');
  await sql`update admin_users set active=false where id=${userId}`;
  const revoked = await http.get('/api/masak/admin/session');
  assert.equal(revoked.status(), 403);
  assert.equal((await revoked.json()).error, 'ADMIN_REQUIRED');
  assert.equal((await post('/api/masak/intake', { captcha: '' })).status(), 503);
  checks.push('İzin iptali mevcut AAL2 oturumunu reddediyor; başvuru kabulü hâlâ 503');
  console.log(
    JSON.stringify({ checks, personalAdminMfaEnrolled: false, realEmailSent: false }, null, 2),
  );
} catch (error) {
  console.error(
    'HOSTED_ADMIN_VERIFY_FAILED',
    error.code || error.name,
    error.stack?.match(/verify-hosted-admin\.mjs:\d+:\d+/)?.[0],
    { completedChecks: checks.length },
  );
  process.exitCode = 1;
} finally {
  await post('/api/masak/auth/logout', {}).catch(() => {});
  if (userId) {
    await sql`delete from audit_logs where actor=${userId}`;
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) {
      console.error('SYNTHETIC_USER_CLEANUP_FAILED');
      process.exitCode = 1;
    }
  }
  await http.dispose();
  await browser.close();
  await sql.end({ timeout: 3 });
}
