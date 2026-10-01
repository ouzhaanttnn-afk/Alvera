import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { bootstrap } from './bootstrap.js';
import { readDocument, mutateDocument, httpError } from './storage.js';

const cookieName = 'alvera_admin';
const digest = text => createHash('sha256').update(text).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function seed() { return { credential: bootstrap, sessions: [], attempts: {}, createdAt: new Date().toISOString() }; }
export function json(res, status, data) { res.setHeader('Cache-Control', 'no-store'); return res.status(status).json(data); }
export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) throw httpError(403, 'İstek kaynağı doğrulanamadı.');
  let url;
  try { url = new URL(origin); } catch { throw httpError(403, 'Geçersiz istek kaynağı.'); }
  if (url.host !== host || (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol !== 'https:')) throw httpError(403, 'Bu istek reddedildi.');
}
function readCookie(req) {
  const raw = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='));
  const token = raw?.slice(cookieName.length + 1) || '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
}
function setCookie(req, res, token, maxAge) {
  const secure = process.env.VERCEL || !/^localhost:|^127\.0\.0\.1:/.test(req.headers.host || '');
  res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
export async function session(req, mutation = false) {
  const token = readCookie(req);
  if (!token) throw httpError(401, 'Lütfen giriş yapın.');
  const document = await readDocument('security.json');
  const active = document?.value.sessions.find(item => equal(item.hash, digest(token)) && item.expires > Date.now());
  if (!active) throw httpError(401, 'Oturumunuz sona erdi. Yeniden giriş yapın.');
  if (mutation) { sameOrigin(req); if (!equal(req.headers['x-csrf-token'], active.csrf)) throw httpError(403, 'Güvenlik doğrulaması başarısız. Sayfayı yenileyin.'); }
  return active;
}
export async function login(req, res, body) {
  sameOrigin(req);
  if (typeof body.password !== 'string' || body.password.length > 256) throw httpError(400, 'Giriş bilgileri geçersiz.');
  const ip = digest(String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0]);
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const result = await mutateDocument('security.json', seed(), state => {
    const now = Date.now();
    state.sessions = state.sessions.filter(item => item.expires > now);
    state.attempts = Object.fromEntries(Object.entries(state.attempts).filter(([, v]) => v.until > now).slice(-128));
    const bucket = state.attempts[ip] || { count: 0, until: now + 15 * 60 * 1000 };
    const globalBucket = state.attempts.global || { count: 0, until: now + 15 * 60 * 1000 };
    if (bucket.count >= 8 || globalBucket.count >= 80) return { blocked: true };
    const credential = state.credential;
    const actual = scryptSync(body.password, credential.salt, 64).toString('hex');
    const ok = body.username === credential.username && equal(actual, credential.hash);
    if (!ok) { bucket.count++; globalBucket.count++; state.attempts[ip] = bucket; state.attempts.global = globalBucket; return { ok: false }; }
    delete state.attempts[ip];
    const active = { hash: digest(token), csrf, expires: now + 8 * 60 * 60 * 1000, username: credential.username };
    state.sessions = state.sessions.slice(-9).concat(active);
    return { ok: true, username: active.username };
  });
  if (result.blocked) { res.setHeader('Retry-After', '900'); throw httpError(429, 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.'); }
  if (!result.ok) throw httpError(401, 'Kullanıcı adı veya şifre doğru değil.');
  setCookie(req, res, token, 28800);
  return { username: result.username, csrf };
}
export async function logout(req, res, active) {
  await mutateDocument('security.json', seed(), state => { state.sessions = state.sessions.filter(item => item.hash !== active.hash); });
  setCookie(req, res, '', 0);
}
export async function changePassword(req, res, active, body) {
  if (typeof body.password !== 'string' || body.password.length < 14 || body.password.length > 128) throw httpError(400, 'Yeni şifre en az 14, en fazla 128 karakter olmalı.');
  const salt = randomBytes(24).toString('hex');
  const hash = scryptSync(body.password, salt, 64).toString('hex');
  await mutateDocument('security.json', seed(), state => {
    if (!equal(scryptSync(String(body.currentPassword || ''), state.credential.salt, 64).toString('hex'), state.credential.hash)) throw httpError(400, 'Mevcut şifre doğru değil.');
    state.credential = { username: active.username, salt, hash };
    state.sessions = [];
  });
  setCookie(req, res, '', 0);
}
