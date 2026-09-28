const SOURCE = 'https://static.altinkaynak.com/public/Gold';
const PRODUCTS = [
  ['PGA', 'Gram Altın'],
  ['PC', 'Çeyrek Altın'],
  ['PY', 'Yarım Altın'],
  ['PA', 'Ata Cumhuriyet'],
  ['PB', '22 Ayar Bilezik']
];

function sourceTimestamp(value) {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value || '');
  if (!parts) throw new Error('Kaynak güncelleme saati geçersiz');
  const iso = `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:${parts[6]}+03:00`;
  if (!Number.isFinite(Date.parse(iso))) throw new Error('Kaynak güncelleme saati geçersiz');
  return iso;
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Yalnızca GET desteklenir' });
  }

  try {
    const upstream = await fetch(SOURCE, {
      headers: { Accept: 'application/json', 'User-Agent': 'AlveraKuyumculuk/1.0' },
      signal: AbortSignal.timeout(7000)
    });
    if (!upstream.ok) throw new Error(`Altınkaynak HTTP ${upstream.status}`);
    const feed = await upstream.json();
    if (!Array.isArray(feed)) throw new Error('Altınkaynak yanıt biçimi geçersiz');

    const prices = PRODUCTS.map(([code, name]) => {
      const entry = feed.find((item) => item?.Kod === code);
      if (!entry) throw new Error(`Eksik altın türü: ${code}`);
      const buy = String(entry.Alis || '');
      const sell = String(entry.Satis || '');
      const pricePattern = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
      if (!pricePattern.test(buy) || !pricePattern.test(sell)) throw new Error(`Geçersiz fiyat: ${code}`);
      return { code, name, buy, sell };
    });

    const source_updated_at = sourceTimestamp(feed.find((item) => item?.Kod === 'PGA')?.GuncellenmeZamani);
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.status(200).json({ source: 'Altınkaynak', source_url: SOURCE, source_updated_at, prices });
  } catch (error) {
    console.error('[prices]', error);
    response.setHeader('Cache-Control', 'no-store');
    return response.status(503).json({ error: 'Altınkaynak fiyatlarına şu anda ulaşılamıyor.' });
  }
}
