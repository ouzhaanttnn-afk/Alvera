export const DEFAULT_PRODUCTS = ['GA', 'PC', 'PY', 'PT', 'PA'];

const LABELS = {
  GA: 'Gram Altın',
  PC: 'Çeyrek Altın',
  PY: 'Yarım Altın',
  PT: 'Tam Altın',
  PA: 'Ata Cumhuriyet'
};

export function normalizeAltinkaynak(rows, selected = DEFAULT_PRODUCTS) {
  if (!Array.isArray(rows)) throw new TypeError('Altınkaynak response must be an array');

  const wanted = new Set(selected);
  const prices = rows
    .filter((row) => row && wanted.has(String(row.Kod || '').trim()))
    .map((row) => ({
      code: String(row.Kod).trim(),
      name: LABELS[String(row.Kod).trim()] || String(row.Aciklama || '').trim(),
      buy: String(row.Alis || '').trim(),
      sell: String(row.Satis || '').trim(),
      updated: String(row.GuncellenmeZamani || '').trim()
    }))
    .filter((row) => row.buy && row.sell);

  const order = new Map(selected.map((code, index) => [code, index]));
  prices.sort((a, b) => order.get(a.code) - order.get(b.code));

  return {
    source: 'Altınkaynak',
    sourceUrl: 'https://www.altinkaynak.com/canli-kurlar/altin',
    updated: prices[0]?.updated || null,
    prices
  };
}
