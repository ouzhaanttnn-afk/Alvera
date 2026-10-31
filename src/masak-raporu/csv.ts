// CSV okuma/yazma ve işlem içe aktarma doğrulaması (saf fonksiyonlar, veritabanından bağımsız).
import { parseTurkishDateTime } from './dates';
import { lineTotal, MoneyError, parseAmount, parseScaled, scaledToString } from './money';

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const head = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ';': head.split(';').length, ',': head.split(',').length, '\t': head.split('\t').length };
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as ',' | ';' | '\t') || ';';
}

/** RFC 4180 uyumlu ayrıştırma; tırnak içindeki ayraç ve satır sonlarını destekler. */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('CSV kapanmamış tırnak içeriyor.');
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

/** Excel'de formül olarak çalışabilecek hücreleri etkisizleştirir (CSV injection). */
function safeCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][], delimiter = ';'): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(safeCell).join(delimiter)).join('\r\n') + '\r\n';
}

// ---------- İşlem içe aktarma ----------
export const IMPORT_FIELDS = {
  occurred_at: { label: 'İşlem tarihi', required: true },
  customer_identifier: { label: 'Müşteri TCKN / VKN / yabancı kimlik no', required: true },
  type: { label: 'İşlem türü', required: true },
  product_description: { label: 'Ürün açıklaması', required: true },
  karat: { label: 'Ayar', required: false },
  weight_grams: { label: 'Gramaj', required: false },
  quantity: { label: 'Adet', required: false },
  unit_price: { label: 'Birim fiyat', required: false },
  total: { label: 'Toplam tutar', required: true },
  currency: { label: 'Para birimi', required: false },
  fx_rate: { label: 'Kur', required: false },
  fx_source: { label: 'Kur kaynağı', required: false },
  payment_method: { label: 'Ödeme yöntemi', required: true },
  invoice_reference: { label: 'Fatura/fiş no', required: false },
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;
export type Mapping = Partial<Record<ImportField, number>>;

export const TYPE_ALIASES: Record<string, string> = {
  'altın satışı': 'gold_sale', 'altin satisi': 'gold_sale', satış: 'gold_sale', gold_sale: 'gold_sale',
  'altın alışı': 'gold_purchase', 'altin alisi': 'gold_purchase', alış: 'gold_purchase', gold_purchase: 'gold_purchase',
  'hurda altın alışı': 'scrap_gold_purchase', hurda: 'scrap_gold_purchase', scrap_gold_purchase: 'scrap_gold_purchase',
  'takı satışı': 'jewelry_sale', 'mücevher satışı': 'jewelry_sale', jewelry_sale: 'jewelry_sale',
  külçe: 'bullion', 'gram altın': 'bullion', bullion: 'bullion',
  değişim: 'exchange', takas: 'exchange', exchange: 'exchange',
  iade: 'return', return: 'return',
  diğer: 'other_precious', other_precious: 'other_precious',
};
export const PAYMENT_ALIASES: Record<string, string> = {
  nakit: 'nakit', 'banka kartı': 'banka_karti', 'kredi kartı': 'kredi_karti', havale: 'havale_eft', eft: 'havale_eft',
  'havale/eft': 'havale_eft', altın: 'altin', karma: 'karma', diğer: 'diger',
  banka_karti: 'banka_karti', kredi_karti: 'kredi_karti', havale_eft: 'havale_eft', altin: 'altin', diger: 'diger',
};

export type ImportRow = {
  line: number;
  occurredAt: string;
  customerIdentifier: string;
  type: string;
  productDescription: string;
  karat: number | null;
  weightGrams: string | null;
  quantity: number;
  unitPriceKurus: bigint | null;
  totalKurus: bigint;
  currency: string;
  fxRate: string | null;
  fxSource: string | null;
  paymentMethod: string;
  invoiceReference: string | null;
  duplicateKey: string;
};
export type ImportIssue = { line: number; field: string; message: string };
export type ImportResult = { rows: ImportRow[]; errors: ImportIssue[]; duplicates: ImportIssue[] };

export function duplicateKey(r: { occurredAt: string; customerIdentifier: string; totalKurus: bigint; invoiceReference: string | null }) {
  return [r.occurredAt.slice(0, 16), r.customerIdentifier, r.totalKurus.toString(), (r.invoiceReference || '').toLowerCase()].join('|');
}

/**
 * Satırları doğrular. `existingKeys`: veritabanında hâlihazırda bulunan işlemlerin duplicateKey değerleri.
 * İlk satır başlık kabul edilir (hasHeader).
 */
export function validateImport(table: string[][], mapping: Mapping, existingKeys: Set<string>, hasHeader = true): ImportResult {
  const rows: ImportRow[] = [];
  const errors: ImportIssue[] = [];
  const duplicates: ImportIssue[] = [];
  for (const [field, meta] of Object.entries(IMPORT_FIELDS))
    if (meta.required && mapping[field as ImportField] === undefined)
      errors.push({ line: 0, field, message: `"${meta.label}" kolonu eşlenmedi.` });
  if (errors.length) return { rows, errors, duplicates };
  const seen = new Set<string>();
  table.slice(hasHeader ? 1 : 0).forEach((cells, index) => {
    const line = index + (hasHeader ? 2 : 1);
    const get = (f: ImportField) => (mapping[f] === undefined ? '' : (cells[mapping[f]!] ?? '').trim());
    const rowErrors: ImportIssue[] = [];
    const attempt = <T,>(field: string, fn: () => T): T | undefined => {
      try { return fn(); } catch (e) { rowErrors.push({ line, field, message: e instanceof Error ? e.message : 'Geçersiz değer.' }); }
    };
    const occurredAt = attempt('occurred_at', () => parseTurkishDateTime(get('occurred_at')));
    const customerIdentifier = get('customer_identifier').replace(/\s/g, '');
    if (!/^[A-Z0-9]{5,20}$/i.test(customerIdentifier)) rowErrors.push({ line, field: 'customer_identifier', message: 'Müşteri tanımlayıcısı hatalı.' });
    const type = TYPE_ALIASES[get('type').toLocaleLowerCase('tr')];
    if (!type) rowErrors.push({ line, field: 'type', message: `Bilinmeyen işlem türü: "${get('type')}"` });
    const productDescription = get('product_description');
    if (productDescription.length < 2) rowErrors.push({ line, field: 'product_description', message: 'Ürün açıklaması gerekli.' });
    const karatText = get('karat');
    const karat = karatText ? Number(karatText) : null;
    if (karat !== null && ![8, 9, 10, 14, 18, 21, 22, 24].includes(karat)) rowErrors.push({ line, field: 'karat', message: 'Ayar geçersiz.' });
    const weightText = get('weight_grams');
    const weightGrams = weightText ? attempt('weight_grams', () => scaledToString(parseScaled(weightText, 3, 'Gramaj'), 3)) ?? null : null;
    const quantityText = get('quantity') || '1';
    const quantity = Number(quantityText);
    if (!Number.isInteger(quantity) || quantity <= 0) rowErrors.push({ line, field: 'quantity', message: 'Adet pozitif tam sayı olmalı.' });
    const unitText = get('unit_price');
    const unitPriceKurus = unitText ? attempt('unit_price', () => parseAmount(unitText)) ?? null : null;
    const totalKurus = attempt('total', () => parseAmount(get('total')));
    if (unitPriceKurus !== null && totalKurus !== undefined && Number.isInteger(quantity) && quantity > 0) {
      const expected = lineTotal(unitPriceKurus, quantity);
      if (expected !== totalKurus)
        rowErrors.push({ line, field: 'total', message: `Tutar hesaplama hatası: birim fiyat × adet = ${expected} kuruş, toplam ${totalKurus} kuruş.` });
    }
    const currency = (get('currency') || 'TRY').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) rowErrors.push({ line, field: 'currency', message: 'Para birimi 3 harfli kod olmalı.' });
    const fxRate = get('fx_rate') || null;
    const fxSource = get('fx_source') || null;
    if (currency !== 'TRY' && (!fxRate || !fxSource))
      rowErrors.push({ line, field: 'fx_rate', message: 'Döviz işlemlerinde kur ve kur kaynağı gerekli.' });
    if (fxRate) attempt('fx_rate', () => parseScaled(fxRate, 6, 'Kur'));
    const paymentMethod = PAYMENT_ALIASES[get('payment_method').toLocaleLowerCase('tr')];
    if (!paymentMethod) rowErrors.push({ line, field: 'payment_method', message: `Bilinmeyen ödeme yöntemi: "${get('payment_method')}"` });
    if (rowErrors.length || !occurredAt || totalKurus === undefined || !type || !paymentMethod) {
      errors.push(...rowErrors);
      return;
    }
    const invoiceReference = get('invoice_reference') || null;
    const row: ImportRow = {
      line, occurredAt, customerIdentifier, type, productDescription, karat, weightGrams: weightGrams ?? null, quantity,
      unitPriceKurus, totalKurus, currency, fxRate, fxSource, paymentMethod, invoiceReference, duplicateKey: '',
    };
    row.duplicateKey = duplicateKey(row);
    if (seen.has(row.duplicateKey)) duplicates.push({ line, field: 'satır', message: 'Dosyada aynı işlem birden fazla kez var.' });
    else if (existingKeys.has(row.duplicateKey)) duplicates.push({ line, field: 'satır', message: 'Bu işlem sistemde zaten kayıtlı görünüyor.' });
    else rows.push(row);
    seen.add(row.duplicateKey);
  });
  return { rows, errors, duplicates };
}

export { MoneyError };
