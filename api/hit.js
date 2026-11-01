import { record } from '../lib/stats.js';
import { sameOrigin } from '../lib/security.js';
import { available, httpError, mutateDocument } from '../lib/storage.js';

// 204 yanıtı: Next, API işleyicisinin değer döndürmesini istemez; bu yüzden `end()` sonucu döndürülmez.
const noContent = (res) => { res.status(204).end(); };

// Robotlar sayılmaz. User-Agent yalnızca bu süzme için okunur, hiçbir yere kaydedilmez.
const ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|node-fetch|axios|go-http|java\//i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Yalnızca POST desteklenir.' }); }
  try {
    sameOrigin(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (typeof body.e !== 'string') throw httpError(400, 'Geçersiz olay.');
    if (ROBOT.test(String(req.headers['user-agent'] || ''))) return noContent(res);
    // Depolama yoksa sessizce yutmak sayımın hiç çalışmadığını gizler; 503 sorunu görünür kılar (ziyaretçi bunu görmez).
    if (!available()) throw httpError(503, 'Depolama kullanılamıyor.');
    let accepted = false;
    await mutateDocument('stats.json', { schema: 1, days: {} }, (value) => { accepted = record(value, body.e); });
    if (!accepted) throw httpError(400, 'Geçersiz olay.');
    return noContent(res);
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 503);
    if (!error.status && !(error instanceof SyntaxError)) console.error('[hit]', error?.message);
    return res.status(status).json({ error: status === 503 ? 'Kaydedilemedi.' : 'İstek reddedildi.' });
  }
}
