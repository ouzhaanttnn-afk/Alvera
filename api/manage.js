import { catalog, defaults, updateCatalog, validProduct, validSettings, text } from '../lib/catalog.js';
import { json, session, login, logout, changePassword, sameOrigin } from '../lib/security.js';
import { available, savePhoto, httpError } from '../lib/storage.js';

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const action = req.query.action || 'session';
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw httpError(405, 'Yöntem desteklenmiyor.'); }
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) : {};
    if (action === 'login' && req.method === 'POST') return json(res, 200, await login(req, res, body));
    const active = await session(req, req.method !== 'GET');
    if (action === 'session' && req.method === 'GET') return json(res, 200, { username: active.username, csrf: active.csrf, storage: available(), environment: process.env.VERCEL_ENV || 'local' });
    if (action === 'catalog' && req.method === 'GET') return json(res, 200, await catalog());
    if (action === 'export' && req.method === 'GET') { res.setHeader('Content-Disposition', 'attachment; filename="alvera-katalog-yedegi.json"'); return json(res, 200, await catalog()); }
    if (req.method !== 'POST') throw httpError(405, 'Bu işlem POST gerektirir.');
    sameOrigin(req);
    if (action === 'logout') { await logout(req, res, active); return json(res, 200, { ok: true }); }
    if (action === 'password') { await changePassword(req, res, active, body); return json(res, 200, { ok: true }); }
    if (action === 'upload') {
      if (typeof body.data !== 'string' || body.data.length > 2900000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw httpError(400, 'Fotoğraf geçersiz veya çok büyük.');
      const bytes = Buffer.from(body.data, 'base64');
      const type = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg' : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
      if (!type || bytes.length > 2100000 || bytes.length < 32) throw httpError(400, 'Sadece JPEG, PNG veya WebP yüklenebilir (en fazla 2 MB).');
      const current = await catalog();
      if (current.media.length >= 600) throw httpError(400, '600 fotoğraf sınırına ulaşıldı.');
      const photo = { ...(await savePhoto(bytes, type)), type, name: text(body.name, 140), width: Math.min(4000, Math.max(1, +body.width || 1)), height: Math.min(4000, Math.max(1, +body.height || 1)), uploadedAt: new Date().toISOString() };
      const saved = await updateCatalog(current.revision, value => { value.media.push(photo); });
      return json(res, 200, { photo, revision: saved.revision });
    }
    if (action === 'save') return json(res, 200, await updateCatalog(body.revision, value => {
      if (value.products.length >= 300 && !body.product?.id) throw httpError(400, '300 ürün sınırına ulaşıldı.');
      const product = validProduct(body.product || {}, value);
      const index = value.products.findIndex(p => p.id === product.id);
      if (index < 0) value.products.push(product); else value.products[index] = product;
    }));
    if (action === 'archive' || action === 'restore') return json(res, 200, await updateCatalog(body.revision, value => {
      const product = value.products.find(p => p.id === body.id); if (!product) throw httpError(404, 'Ürün bulunamadı.');
      product.archived = action === 'archive'; if (product.archived) product.visible = false;
    }));
    if (action === 'order') return json(res, 200, await updateCatalog(body.revision, value => {
      if (!Array.isArray(body.ids) || body.ids.length !== value.products.length || new Set(body.ids).size !== value.products.length || body.ids.some(id => !value.products.some(p => p.id === id))) throw httpError(400, 'Ürün sırası geçersiz.');
      body.ids.forEach((id, order) => { value.products.find(p => p.id === id).order = order; });
    }));
    if (action === 'settings') return json(res, 200, await updateCatalog(body.revision, value => { value.settings = validSettings(body.settings || {}, value.settings, value.media); }));
    if (action === 'import') return json(res, 200, await updateCatalog(body.revision, value => {
      const backup = body.backup;
      if (backup?.schema !== 1 || !Array.isArray(backup.products) || backup.products.length > 300 || !Array.isArray(backup.media) || backup.media.length > 600) throw httpError(400, 'Bu dosya Alvera katalog yedeği değil.');
      const media = backup.media.map(m => {
        if (!/^[\da-f-]{36}$/.test(m.id) || !(m.url?.startsWith('https://') && new URL(m.url).hostname.endsWith('.public.blob.vercel-storage.com') || !process.env.VERCEL && /^\/local-media\/[\da-f-]+\.(jpg|png|webp)$/.test(m.url))) throw httpError(400, 'Yedekte geçersiz fotoğraf bağlantısı var.');
        return { id: m.id, url: m.url, name: text(m.name, 140), type: text(m.type, 30), width: +m.width || 1, height: +m.height || 1, uploadedAt: text(m.uploadedAt, 40) };
      });
      if (new Set(media.map(m => m.id)).size !== media.length) throw httpError(400, 'Yedekte tekrar eden fotoğraf var.');
      const merged = { products: [], media };
      const products = backup.products.map((p, order) => ({ ...validProduct({ ...p, id: undefined }, merged), archived: !!p.archived, visible: !!p.visible && !p.archived, order }));
      value.settings = validSettings(backup.settings || {}, defaults.settings, media);
      value.media = media; value.products = products;
    }));
    throw httpError(404, 'İşlem bulunamadı.');
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 503);
    return json(res, status, { error: error.status ? error.message : status === 400 ? 'İstek verisi geçersiz.' : 'İşlem tamamlanamadı. Biraz sonra yeniden deneyin.' });
  }
}
