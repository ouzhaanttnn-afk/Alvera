import { catalog } from '../lib/catalog.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const value = await catalog().catch(() => null);
  const url = value?.settings.siteUrl || 'https://alvera-ashy.vercel.app';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</loc></url></urlset>`);
}
