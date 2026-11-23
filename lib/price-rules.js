// Fiyat motoru ayarları: yönetim panelinden değiştirilir, /api/prices her istekte (kısa önbellekle) okur.
// Milyemler tam sayıdır (1001 = ×1,001). İşçilik farkları kuruş cinsindendir ve yalnızca satışa eklenir.
import { available, mutateDocument, readDocument, httpError } from './storage.js';

export const PRICE_RULES_DOCUMENT = 'price-rules.json';

export const DEFAULT_RULES = Object.freeze({
  gram24Buy: 1001,
  gram24Sell: 1010,
  bilezik22Buy: 912,
  bilezik22Sell: 922,
  ceyrekSellExtra: 2000,
  yarimSellExtra: 0,
  teklikSellExtra: 0,
  ataSellExtra: 0
});

// Yanlış yazımı (ör. 1010 yerine 10100) kaydetmeden yakalayan sınırlar.
export const RULE_LIMITS = Object.freeze({
  gram24Buy: [950, 1050],
  gram24Sell: [950, 1100],
  bilezik22Buy: [850, 960],
  bilezik22Sell: [850, 1000],
  ceyrekSellExtra: [0, 100000],
  yarimSellExtra: [0, 200000],
  teklikSellExtra: [0, 400000],
  ataSellExtra: [0, 400000]
});

const LABELS = {
  gram24Buy: '24 ayar alış milyemi',
  gram24Sell: '24 ayar satış milyemi',
  bilezik22Buy: '22 ayar bilezik alış milyemi',
  bilezik22Sell: '22 ayar bilezik satış milyemi',
  ceyrekSellExtra: 'Çeyrek işçilik farkı',
  yarimSellExtra: 'Yarım işçilik farkı',
  teklikSellExtra: 'Teklik işçilik farkı',
  ataSellExtra: 'Ata işçilik farkı'
};

export function validRules(input) {
  if (!input || typeof input !== 'object') throw httpError(400, 'Fiyat ayarları geçersiz.');
  const rules = {};
  for (const [key, [min, max]] of Object.entries(RULE_LIMITS)) {
    const value = input[key];
    if (!Number.isInteger(value)) throw httpError(400, `${LABELS[key]} tam sayı olmalı.`);
    if (value < min || value > max) {
      const unit = key.endsWith('Extra') ? ` (${min / 100}–${max / 100} TL)` : ` (${min}–${max})`;
      throw httpError(400, `${LABELS[key]} izin verilen aralığın dışında${unit}.`);
    }
    rules[key] = value;
  }
  if (rules.gram24Sell < rules.gram24Buy) throw httpError(400, '24 ayar satış milyemi alıştan küçük olamaz.');
  if (rules.bilezik22Sell < rules.bilezik22Buy) throw httpError(400, '22 ayar bilezik satış milyemi alıştan küçük olamaz.');
  return rules;
}

// Kayıtlı belge bozuksa veya okunamazsa varsayılanlar kullanılır; fiyat hiçbir zaman ayarsız kalmaz.
// Sonradan eklenen alanlar (ör. teklik) eski kayıtta yoksa yalnızca o alan varsayılanı alır; kayıtlı diğer ayarlar korunur.
function fromDocument(value) {
  try { return validRules({ ...DEFAULT_RULES, ...(value?.rules || {}) }); } catch { return { ...DEFAULT_RULES }; }
}

const CACHE_MS = 20 * 1000;
let cache = null;

export async function loadRules() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules;
  if (!available()) return { ...DEFAULT_RULES };
  try {
    const document = await readDocument(PRICE_RULES_DOCUMENT);
    const rules = document ? fromDocument(document.value) : { ...DEFAULT_RULES };
    cache = { rules, at: Date.now() };
    return rules;
  } catch (error) {
    console.error('[price-rules] okunamadı', error?.message);
    return cache?.rules || { ...DEFAULT_RULES };
  }
}

export async function readRulesDocument() {
  const document = available() ? await readDocument(PRICE_RULES_DOCUMENT) : null;
  const value = document?.value || {};
  return {
    rules: fromDocument(value),
    previous: value.previous ? fromDocument({ rules: value.previous }) : null,
    updatedAt: value.updatedAt || null,
    updatedBy: value.updatedBy || null
  };
}

export async function saveRules(input, username) {
  const rules = validRules(input);
  await mutateDocument(PRICE_RULES_DOCUMENT, {}, (value) => {
    const old = fromDocument(value);
    value.previous = old;
    value.rules = rules;
    value.updatedAt = new Date().toISOString();
    value.updatedBy = typeof username === 'string' ? username.slice(0, 80) : null;
  });
  cache = { rules, at: Date.now() };
  return readRulesDocument();
}

export async function undoRules(username) {
  let restored = null;
  await mutateDocument(PRICE_RULES_DOCUMENT, {}, (value) => {
    if (!value.previous) throw httpError(400, 'Geri alınacak önceki ayar yok.');
    const old = fromDocument(value);
    restored = fromDocument({ rules: value.previous });
    value.previous = old;
    value.rules = restored;
    value.updatedAt = new Date().toISOString();
    value.updatedBy = typeof username === 'string' ? username.slice(0, 80) : null;
  });
  cache = { rules: restored, at: Date.now() };
  return readRulesDocument();
}

export function resetRulesCache() { cache = null; }
