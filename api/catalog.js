import { catalog, publicCatalog } from '../lib/catalog.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Yöntem desteklenmiyor.' }); }
  try { res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30'); return res.status(200).json(publicCatalog(await catalog())); }
  catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'Katalog şu anda kullanılamıyor.' }); }
}
