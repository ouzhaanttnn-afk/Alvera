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
  if (!Array.isArray(feed)) throw new Error('Fiyat yanıtı biçimi geçersiz');
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
  return { source_updated_at, prices: [...prices, ...extra] };
}

// ---- İkinci kaynak: has altın ve sarrafiye TL fiyatları (Ozan Döviz'in sayfasının kendi yüklediği veri adresleri) ----
// 24 ayar gram: alış = 995 milyem (has alış × 0,995; kaynağın "995 HAS" satırıyla aynıdır), satış = has satış × 1,003.
// Tam sayı kuruşla ve yarım kuruş yukarı yuvarlanarak hesaplanır.
const GRAM24_ALIS_PERMILLE = 995;
const GRAM24_SATIS_PERMILLE = 1003;
const OZAN = 'https://ozandoviz.com/';
const OZAN_NUMBER = /^\d{1,7}(?:\.\d{1,2})?$/;
const trFormat = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
const formatCents = (cents) => trFormat.format(cents / 100);

export function parseOzanNumber(value) {
  const text = String(value ?? '').trim();
  if (!OZAN_NUMBER.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// Satırı koduna göre bulur; alış/satış geçerli, alış ≤ satış ve makas makul değilse null verir.
export function ozanRow(data, code) {
  const rows = Array.isArray(data) ? data : Object.values(data && typeof data === 'object' ? data : {});
  const wanted = code.toLocaleUpperCase('tr-TR');
  const row = rows.find((item) => String(item?.code ?? '').trim().toLocaleUpperCase('tr-TR') === wanted);
  const buy = parseOzanNumber(row?.alis);
  const sell = parseOzanNumber(row?.satis);
  if (buy === null || sell === null || sell < buy || sell / buy > 1.1) return null;
  return { buy: Math.round(buy * 100), sell: Math.round(sell * 100) };
}

const mid = (entry) => (parsePrice(entry.buy) + parsePrice(entry.sell)) / 2;
const near = (centsMid, entry, tolerance) => Math.abs(centsMid / 100 / mid(entry) - 1) <= tolerance;

// İkinci kaynağın değerlerini, ilk kaynakla çapraz kontrolden geçenler için üzerine yazar. Geçmeyen kalem ilk kaynakta kalır.
export function applyOzan(payload, ozan) {
  const prices = payload.prices.map((entry) => ({ ...entry }));
  const find = (code) => prices.find((entry) => entry.code === code);
  const used = [];
  const gram = find('PGA');
  if (ozan?.has && gram && near((ozan.has.buy + ozan.has.sell) / 2, gram, 0.04)) {
    gram.buy = formatCents(Math.round((ozan.has.buy * GRAM24_ALIS_PERMILLE) / 1000));
    gram.sell = formatCents(Math.round((ozan.has.sell * GRAM24_SATIS_PERMILLE) / 1000));
    used.push('PGA');
  }
  for (const [code, row] of Object.entries(ozan?.sarrafiye || {})) {
    const entry = find(code);
    if (!row || !entry || !near((row.buy + row.sell) / 2, entry, 0.08)) continue;
    entry.buy = formatCents(row.buy);
    entry.sell = formatCents(row.sell);
    used.push(code);
  }
  return { payload: { ...payload, prices }, used };
}

async function postOzan(path) {
  const response = await fetch(OZAN + path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AlveraKuyumculuk/1.0' },
    body: 'select=true',
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json())?.data;
}

// Hata veya geçersiz veri sessizce ilk kaynağa döner; PRICES_OZAN=off ile tamamen kapatılabilir.
export async function fetchOzan() {
  if (process.env.PRICES_OZAN === 'off') return null;
  const [gold, sarrafiye] = await Promise.allSettled([postOzan('goldpagedataredis.php'), postOzan('onlinesarrafiyetlpagedataredis.php')]);
  for (const result of [gold, sarrafiye]) if (result.status === 'rejected') console.error('[prices] ikinci kaynak', result.reason?.message);
  const has = gold.status === 'fulfilled' ? ozanRow(gold.value, 'HAS ALTIN /TL') : null;
  const table = sarrafiye.status === 'fulfilled' ? sarrafiye.value : null;
  return { has, sarrafiye: { PC: ozanRow(table, 'Y. Çeyrek'), PY: ozanRow(table, 'Y. Yarım'), PA: ozanRow(table, 'Y. Ata Lira') } };
}

async function fetchPrimary() {
  const upstream = await fetch(SOURCE, {
    headers: { Accept: 'application/json', 'User-Agent': 'AlveraKuyumculuk/1.0' },
    signal: AbortSignal.timeout(7000)
  });
  if (!upstream.ok) throw new Error(`Fiyat kaynağı HTTP ${upstream.status}`);
  return buildPayload(await upstream.json());
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
    const [primary, ozan] = await Promise.all([fetchPrimary(), fetchOzan().catch(() => null)]);
    const payload = ozan ? applyOzan(primary, ozan).payload : primary;
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
    return response.status(503).json({ error: 'Fiyatlara şu anda ulaşılamıyor.' });
  }
}
