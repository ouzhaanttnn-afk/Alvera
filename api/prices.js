import { normalizeAltinkaynak } from '../lib/altinkaynak.js';

const ENDPOINT = 'https://static.altinkaynak.com/public/Gold';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=90');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const upstream = await fetch(ENDPOINT, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AlveraKuyumculuk/1.0 (+https://github.com/ouzhaanttnn-afk/Alvera)'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (!upstream.ok) throw new Error(`Altınkaynak HTTP ${upstream.status}`);

    const json = await upstream.json();
    const payload = normalizeAltinkaynak(json);

    if (!payload.prices.length) throw new Error('No expected gold products in response');

    return res.status(200).json({ ...payload, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[prices]', error);
    return res.status(503).json({
      error: 'Canlı referans fiyatlarına şu an ulaşılamıyor.',
      source: 'Altınkaynak',
      sourceUrl: 'https://www.altinkaynak.com/canli-kurlar/altin'
    });
  }
}
