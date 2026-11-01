import { catalog } from '../lib/catalog.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const value = await catalog().catch(() => null);
  const url = value?.settings.siteUrl || 'https://alvera-ashy.vercel.app';
  // Son değişiklik tarihi yalnızca katalogda gerçek bir kayıt varsa yazılır; tarih uydurulmaz.
  const changed = value?.updatedAt && Number.isFinite(Date.parse(value.updatedAt)) ? new Date(value.updatedAt).toISOString() : '';
  const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(url)}</loc>${changed ? `<lastmod>${changed}</lastmod>` : ''}</url></urlset>`);
}
