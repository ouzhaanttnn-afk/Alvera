import { available, mutateDocument, readDocument } from '../lib/storage.js';

const SOURCE = 'https://static.altinkaynak.com/public/Gold';
const PRODUCTS = [
  ['PGA', 'Gram Altın'],
  ['PC', 'Çeyrek Altın'],
  ['PY', 'Yarım Altın'],
  ['PA', 'Ata Cumhuriyet'],
  ['PB', '22 Ayar Bilezik']
];
// Tabloda gösterilmez; yalnızca gram hesaplayıcı için gram başına ayar fiyatlarıdır.
const EXTRA = [
  ['P18', '18 Ayar Altın'],
  ['P14', '14 Ayar Altın']
];
const SNAPSHOT = 'prices-last.json';
const SNAPSHOT_MAX_AGE = 72 * 60 * 60 * 1000;
// Kaynak fiyatları "6.206" (kuruşsuz) veya "6.206,50" (kuruşlu) biçiminde verebiliyor; ikisi de geçerli.
// Başka her biçim reddedilir: fiyat uydurulmaz, tahmin edilmez.
const PRICE_PATTERN = /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/;

function sourceTimestamp(value) {
  const parts = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(value || '');
  if (!parts) throw new Error('Kaynak güncelleme saati geçersiz');
  const iso = `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:${parts[6]}+03:00`;
  if (!Number.isFinite(Date.parse(iso))) throw new Error('Kaynak güncelleme saati geçersiz');
  return iso;
}

export function parsePrice(value) {
  const text = String(value ?? '');
  if (!PRICE_PATTERN.test(text)) return null;
  const number = Number(text.replaceAll('.', '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function buildPayload(feed) {
  if (!Array.isArray(feed)) throw new Error('Altınkaynak yanıt biçimi geçersiz');
  const read = ([code, name]) => {
    const entry = feed.find((item) => item?.Kod === code);
    if (!entry) throw new Error(`Eksik altın türü: ${code}`);
    const buy = parsePrice(entry.Alis);
    const sell = parsePrice(entry.Satis);
    if (buy === null || sell === null) throw new Error(`Geçersiz fiyat: ${code}`);
    // Kaynaktaki gösterim biçimi aynen korunur; istemci iki biçimi de okuyabilir.
    return { code, name, buy: String(entry.Alis), sell: String(entry.Satis) };
  };
  const prices = PRODUCTS.map(read);
  let extra = [];
  try { extra = EXTRA.map(read); } catch { /* Hesaplayıcının 14/18 ayar satırları yoksa yalnızca onlar gizlenir. */ }
  const source_updated_at = sourceTimestamp(feed.find((item) => item?.Kod === 'PGA')?.GuncellenmeZamani);
  return { source: 'Altınkaynak', source_url: SOURCE, source_updated_at, prices: [...prices, ...extra] };
}

async function saveSnapshot(payload) {
  if (!available()) return;
  try {
    await mutateDocument(SNAPSHOT, {}, (value) => {
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, payload, { saved_at: new Date().toISOString() });
    });
  } catch (error) {
    console.error('[prices] yedek kaydedilemedi', error?.message);
  }
}

async function loadSnapshot() {
  if (!available()) return null;
  try {
    const document = await readDocument(SNAPSHOT);
    const value = document?.value;
    if (!value?.prices || !value.source_updated_at) return null;
    if (Date.now() - Date.parse(value.source_updated_at) > SNAPSHOT_MAX_AGE) return null;
    return value;
  } catch {
    return null;
  }
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
    const payload = buildPayload(await upstream.json());
    await saveSnapshot(payload);
    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return response.status(200).json(payload);
  } catch (error) {
    console.error('[prices]', error?.message);
    // Kaynağa ulaşılamazsa son başarılı fiyatlar, kendi güncelleme saatiyle ve "eski" işaretiyle sunulur.
    const snapshot = await loadSnapshot();
    if (snapshot) {
      const { saved_at, ...payload } = snapshot;
      response.setHeader('Cache-Control', 'public, s-maxage=60');
      return response.status(200).json({ ...payload, stale: true, snapshot_saved_at: saved_at });
    }
    response.setHeader('Cache-Control', 'no-store');
    return response.status(503).json({ error: 'Altınkaynak fiyatlarına şu anda ulaşılamıyor.' });
  }
}
