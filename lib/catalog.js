import { randomUUID } from 'node:crypto';
import { readDocument, mutateDocument, httpError } from './storage.js';

export const categories = { pirlanta: 'Pırlanta', yuzuk: 'Yüzük', kolye: 'Kolye', kupe: 'Küpe', bileklik: 'Bileklik', bilezik: 'Bilezik', hediye: 'Hediye', ozel: 'Özel seçki' };
export const defaults = { schema: 1, revision: '', updatedAt: null, products: [], media: [], settings: { phone: '0312 390 24 25', whatsapp: '905334853040', address: "Cengizhan Mah., Natoyolu Cad. No:209/C, Mamak / Ankara", mapsUrl: "https://www.google.com/maps/search/?api=1&query=Cengizhan%20Mah.%2C%20Natoyolu%20Cad.%20No%3A209%2FC%2C%20Mamak%20%2F%20Ankara", instagram: 'alvera_kuyumculuk', hours: '', storeImage: '', heroSubtitle: "Günlük bir zarafet, özel bir hediye. Altın ve pırlanta seçkimizi yakından tanıyın.", introText: "Mücevheri yakından görmek başka. Natoyolu’ndaki mağazamızda modelleri deneyin; ayarını, ağırlığını ve fiyatını birlikte konuşalım.", googleRating: '', googleReviewCount: '', siteUrl: 'https://alvera-ashy.vercel.app' } };
export const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
// Upgrade only the old built-in contact/copy values, never custom shop settings.
// Reads remain side-effect-free; a normal authorized save persists the upgrade.
function upgradeDefaults(value) {
  const settings = value.settings;
  if (!settings) return value;
  if (settings.address === 'Mamak, Natoyolu Cad. No:417, Ankara') {
    settings.address = defaults.settings.address;
    settings.mapsUrl = defaults.settings.mapsUrl;
  }
  if (settings.address === defaults.settings.address && settings.mapsUrl === 'https://www.google.com/maps/search/?api=1&query=Alvera%20Kuyumculuk%20Natoyolu%20Ankara') settings.mapsUrl = defaults.settings.mapsUrl;
  if (settings.heroSubtitle === 'Kendiniz için, sevdiğiniz biri için. Aradığınız parçayı birlikte seçelim.') settings.heroSubtitle = defaults.settings.heroSubtitle;
  if (settings.introText === 'Ne alacağınıza karar vermiş olmanız gerekmiyor. Mağazada birlikte bakabilir, modelleri karşılaştırabilir, aklınıza takılanları sorabilirsiniz.') settings.introText = defaults.settings.introText;
  return value;
}
export async function catalog() { return upgradeDefaults((await readDocument('catalog.json'))?.value || structuredClone(defaults)); }
export function publicCatalog(value) {
  const products = value.products.filter(p => p.visible && !p.archived).sort((a, b) => a.order - b.order);
  const needed = new Set(products.flatMap(p => p.images).concat(value.settings.storeImage));
  return { revision: value.revision, settings: value.settings, products, media: value.media.filter(m => needed.has(m.id)), categories };
}
export function validSettings(input, current, media) {
  const settings = { ...current };
  for (const key of ['phone', 'whatsapp', 'address', 'mapsUrl', 'instagram', 'hours', 'heroSubtitle', 'introText', 'googleRating', 'googleReviewCount', 'siteUrl', 'storeImage']) if (key in input) settings[key] = text(input[key], ['introText', 'heroSubtitle'].includes(key) ? 800 : 300);
  if (!/^\+?[0-9 ()-]{7,24}$/.test(settings.phone)) throw httpError(400, 'Telefon numarasını kontrol edin.');
  settings.whatsapp = settings.whatsapp.replace(/\D/g, '');
  if (!/^[1-9]\d{9,14}$/.test(settings.whatsapp)) throw httpError(400, 'WhatsApp numarası ülke koduyla girilmeli. Örnek: 90533…');
  settings.instagram = settings.instagram.replace(/^@/, '');
  if (!/^[\w.]{1,30}$/.test(settings.instagram)) throw httpError(400, 'Instagram kullanıcı adı geçersiz.');
  if (!settings.address) throw httpError(400, 'Mağaza adresi gerekli.');
  for (const key of ['mapsUrl', 'siteUrl']) {
    try { const url = new URL(settings[key]); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); if (key === 'siteUrl') settings[key] = url.origin; }
    catch { throw httpError(400, 'Harita ve site bağlantıları https:// ile başlamalı.'); }
  }
  if (settings.googleRating && (!/^\d(?:\.\d)?$/.test(settings.googleRating) || +settings.googleRating > 5)) throw httpError(400, 'Google puanı 0 ile 5 arasında olmalı.');
  if (settings.googleReviewCount && !/^\d{1,7}$/.test(settings.googleReviewCount)) throw httpError(400, 'Yorum sayısı geçersiz.');
  if (settings.storeImage && !media.some(m => m.id === settings.storeImage)) throw httpError(400, 'Mağaza fotoğrafı bulunamadı.');
  return upgradeDefaults({ settings }).settings;
}
export async function updateCatalog(revision, mutate) {
  return mutateDocument('catalog.json', defaults, async value => {
    if (revision !== value.revision) throw httpError(409, 'Başka bir sekmede değişiklik yapıldı. Sayfayı yenileyip yeniden deneyin; değişiklikleriniz kaydedilmedi.');
    upgradeDefaults(value);
    await mutate(value);
    value.revision = randomUUID(); value.updatedAt = new Date().toISOString();
    return value;
  });
}
export function validProduct(input, value) {
  const old = input.id && value.products.find(p => p.id === input.id);
  if (input.id && !old) throw httpError(404, 'Ürün bulunamadı.');
  const images = [...new Set(Array.isArray(input.images) ? input.images : [])].slice(0, 8);
  if (images.some(id => !value.media.some(m => m.id === id))) throw httpError(400, 'Ürün fotoğrafı bulunamadı.');
  const name = text(input.name, 120);
  if (!name) throw httpError(400, 'Ürün adı gerekli.');
  if (!categories[input.category]) throw httpError(400, 'Ürün kategorisini seçin.');
  if (input.visible && !images.length) throw httpError(400, 'Yayımlamadan önce en az bir fotoğraf ekleyin.');
  return { id: old?.id || randomUUID(), name, category: input.category, metal: text(input.metal, 100), description: text(input.description, 1600), sku: text(input.sku, 60), images, visible: !!input.visible, archived: old?.archived || false, order: old?.order ?? value.products.length, createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}
