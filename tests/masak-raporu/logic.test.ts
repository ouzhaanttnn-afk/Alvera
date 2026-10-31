import { describe, expect, it } from 'vitest';
import { evaluate, ruleAt, type CustomerFacts, type Tx } from '@/masak-raporu/rules/engine';
import { catalogRules } from '@/masak-raporu/rules/catalog';
import { convertWithRate, formatKurus, kurusFromTl, MoneyError, parseAmount } from '@/masak-raporu/money';
import { parseCsv, toCsv, validateImport, duplicateKey } from '@/masak-raporu/csv';
import { checkDigit, parseTd1, tcknCandidates } from '@/masak-raporu/mrz';
import { createZip, crc32 } from '@/masak-raporu/zip';
import { addBusinessDays, istanbulDate } from '@/masak-raporu/dates';

const rules = catalogRules();
const customer = (over: Partial<CustomerFacts> = {}): CustomerFacts => ({
  id: 'c1', continuousRelationship: false, identityDoubt: false, hasVerifiedIdentity: false, missingFields: [], ...over,
});
let n = 0;
const tx = (tl: number, occurredAt = '2026-10-20T10:00:00+03:00', over: Partial<Tx> = {}): Tx => ({
  id: `t${++n}`, number: `ISL-${n}`, occurredAt, totalTryKurus: kurusFromTl(tl), status: 'completed', type: 'gold_sale',
  paymentMethod: 'banka_karti', customerId: 'c1', ...over,
});
const run = (t: Tx, extra: Partial<Parameters<typeof evaluate>[1]> = {}) =>
  evaluate(rules, { tx: t, customer: customer(), groups: [], customerHistory: [], inRiskCase: false, ...extra });
const keys = (f: ReturnType<typeof run>) => f.map((x) => x.ruleKey);

describe('Test 4 — tekil işlem eşiği (7 Ekim 2026 sonrası)', () => {
  it('369.999 TL kimlik tespiti eşiğini tetiklemez, 370.000 TL tetikler', () => {
    expect(keys(run(tx(369_999)))).not.toContain('KT-ESIK');
    const f = run(tx(370_000)).find((x) => x.ruleKey === 'KT-ESIK')!;
    expect(f.ruleVersion).toBe(5);
    expect(f.identityRequired).toBe(true);
    expect(f.level).toBe('high');
    expect(f.rationale).toContain('370.000,00 TL');
    expect(f.title).not.toMatch(/bildir/i);
  });
  it('istisna: sürekli iş ilişkisinde tutardan bağımsız kimlik tespiti', () => {
    const f = run(tx(1_000), { customer: customer({ continuousRelationship: true }) });
    expect(keys(f)).toEqual(['KT-SUREKLI']);
  });
  it('istisna: iç şüphe incelemesindeki işlem tutardan bağımsız ve gizli uyarı üretir', () => {
    const f = run(tx(500), { inRiskCase: true });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleKey: 'KT-SUPHE', confidential: true, identityRequired: true });
  });
  it('istisna: önceki kimlik bilgisinin doğruluğundan şüphe', () => {
    expect(keys(run(tx(10), { customer: customer({ identityDoubt: true }) }))).toEqual(['KT-DOGRULUK']);
  });
  it('istisna: iptal edilmiş veya düzeltilmiş işlem değerlendirilmez', () => {
    expect(run(tx(900_000, undefined, { status: 'cancelled' }))).toEqual([]);
    expect(run(tx(900_000, undefined, { status: 'superseded' }))).toEqual([]);
  });
  it('kimlik teyidi onaylı müşteride uyarı bilgi seviyesine iner, eksik veri ayrıca raporlanır', () => {
    expect(run(tx(400_000), { customer: customer({ hasVerifiedIdentity: true }) })[0].level).toBe('info');
    const f = run(tx(400_000), { customer: customer({ missingFields: ['Adres'] }) });
    expect(keys(f)).toContain('VERI-EKSIK');
  });
});

describe('Test 5 & 6 — bağlantılı işlemler', () => {
  it('yetkili tarafından bağlantılı kabul edilen 228.000 + 165.000 = 393.000 TL doğru toplanır', () => {
    const a = tx(228_000), b = tx(165_000, '2026-10-21T11:00:00+03:00');
    const f = run(b, { groups: [{ id: 'g1', status: 'confirmed', transactions: [a, b] }] });
    const linked = f.find((x) => x.ruleKey === 'KT-BAGLANTILI')!;
    expect(linked.rationale).toContain('393.000,00 TL');
    expect(linked.linkGroupId).toBe('g1');
    expect(a.totalTryKurus + b.totalTryKurus).toBe(39_300_000n);
  });
  it('bağımsız iki işlem otomatik bağlantılı kabul edilmez; yalnızca insan değerlendirmesi önerilir', () => {
    const a = tx(228_000), b = tx(165_000, '2026-10-21T11:00:00+03:00');
    const f = run(b, { customerHistory: [a] });
    expect(keys(f)).not.toContain('KT-BAGLANTILI');
    const hint = f.find((x) => x.ruleKey === 'RG-OLASI-BAGLANTI')!;
    expect(hint.level).toBe('info');
    expect(hint.identityRequired).toBe(false);
    expect(hint.rationale).toContain('otomatik olarak bağlantılı kabul EDİLMEDİ');
  });
  it('önerilmiş veya reddedilmiş grup toplanmaz', () => {
    const a = tx(228_000), b = tx(165_000);
    for (const status of ['proposed', 'rejected'] as const)
      expect(keys(run(b, { groups: [{ id: 'g', status, transactions: [a, b] }] }))).not.toContain('KT-BAGLANTILI');
  });
  it('gruptaki iptal edilmiş işlem toplama katılmaz', () => {
    const a = tx(228_000, undefined, { status: 'cancelled' }), b = tx(165_000), c = tx(100_000);
    expect(keys(run(b, { groups: [{ id: 'g', status: 'confirmed', transactions: [a, b, c] }] }))).not.toContain('KT-BAGLANTILI');
  });
});

describe('Test 14 — işlem tarihine göre geçerli kural versiyonu', () => {
  it('6 Ekim 2026 işlemi 185.000 TL, 7 Ekim 2026 işlemi 370.000 TL eşiğiyle değerlendirilir', () => {
    const before = run(tx(200_000, '2026-10-06T23:30:00+03:00')).find((x) => x.ruleKey === 'KT-ESIK');
    expect(before?.ruleVersion).toBe(4);
    expect(before?.rationale).toContain('185.000,00 TL');
    expect(keys(run(tx(200_000, '2026-10-07T00:10:00+03:00')))).not.toContain('KT-ESIK');
  });
  it('tarihsel eşikler: 2022 işlemi 85.000 TL, 2021 başı işlemi 20.000 TL eşiğiyle değerlendirilir', () => {
    expect(run(tx(90_000, '2022-07-01T10:00:00+03:00')).find((x) => x.ruleKey === 'KT-ESIK')?.rationale).toContain('85.000,00 TL');
    expect(run(tx(25_000, '2021-03-01T10:00:00+03:00')).find((x) => x.ruleKey === 'KT-ESIK')?.ruleVersion).toBe(1);
    expect(keys(run(tx(80_000, '2021-06-01T10:00:00+03:00')))).toContain('KT-ESIK');
    expect(keys(run(tx(80_000, '2022-07-01T10:00:00+03:00')))).not.toContain('KT-ESIK');
  });
  it('Türkiye saatine göre gün belirlenir (UTC 21:30 = ertesi gün 00:30)', () => {
    expect(istanbulDate('2026-10-06T21:30:00Z')).toBe('2026-10-07');
  });
  it('aynı türde çakışan aktif kural hata verir', () => {
    const bad = [...rules, { ...rules[4], version: 9, validFrom: '2026-10-01' }];
    expect(() => ruleAt(bad, 'threshold_single', '2026-10-10')).toThrow(/RULE_OVERLAP/);
  });
});

describe('Para hesapları', () => {
  it('Türkçe biçimleri kuruşa çevirir ve belirsiz girdiyi reddeder', () => {
    expect(parseAmount('1.234,56')).toBe(123_456n);
    expect(parseAmount('370.000')).toBe(37_000_000n);
    expect(parseAmount('228000,5')).toBe(22_800_050n);
    expect(parseAmount('0.1')).toBe(10n);
    expect(() => parseAmount('1,234.56')).toThrow(MoneyError);
    expect(() => parseAmount('12,345')).toThrow(MoneyError);
    expect(formatKurus(39_300_000n)).toBe('393.000,00 TL');
  });
  it('kayan nokta hatası yok: 0,1 + 0,2 = 0,3', () => {
    expect(parseAmount('0,1') + parseAmount('0,2')).toBe(parseAmount('0,3'));
    expect(convertWithRate(10_000n, '34,125678')).toBe(341_257n);
  });
});

describe('Test 12 — CSV içe aktarma', () => {
  const table = parseCsv(
    'Tarih;TCKN;Tür;Ürün;Ayar;Gram;Adet;Birim;Toplam;Ödeme;Fiş\n' +
      '20.10.2026 10:00;10000000146;Altın satışı;22 ayar bilezik;22;20,5;2;10.000,00;20.000,00;nakit;F-1\n' +
      '20.10.2026 10:00;10000000146;Altın satışı;22 ayar bilezik;22;20,5;2;10.000,00;20.000,00;nakit;F-1\n' +
      '21.10.2026 11:00;10000000146;Altın alışı;Çeyrek;22;1,75;3;5.000,00;14.000,00;nakit;F-2\n' +
      '32.10.2026;10000000146;Bilinmeyen;X;99;abc;0;;;bitcoin;F-3\n' +
      '22.10.2026 09:00;10000000146;Hurda;Hurda bilezik;14;10;1;;9.999,99;havale;F-4\n',
  );
  const mapping = { occurred_at: 0, customer_identifier: 1, type: 2, product_description: 3, karat: 4, weight_grams: 5, quantity: 6, unit_price: 7, total: 8, payment_method: 9, invoice_reference: 10 };
  const existing = new Set([duplicateKey({ occurredAt: new Date('2026-10-22T09:00:00+03:00').toISOString(), customerIdentifier: '10000000146', totalKurus: 999_999n, invoiceReference: 'F-4' })]);
  const result = validateImport(table, mapping, existing);
  it('geçerli satırı kabul eder', () => {
    expect(result.rows.map((r) => r.line)).toEqual([2]);
    expect(result.rows[0]).toMatchObject({ totalKurus: 2_000_000n, weightGrams: '20.500', type: 'gold_sale' });
  });
  it('dosya içi ve sistemdeki mükerrerleri yakalar', () => {
    expect(result.duplicates.map((d) => d.line)).toEqual([3, 6]);
  });
  it('tutar hesaplama hatasını ve hatalı satırları yakalar', () => {
    expect(result.errors.find((e) => e.line === 4)?.message).toMatch(/Tutar hesaplama hatası/);
    const line5 = result.errors.filter((e) => e.line === 5).map((e) => e.field);
    expect(line5).toEqual(expect.arrayContaining(['occurred_at', 'type', 'karat', 'weight_grams', 'quantity', 'total', 'payment_method']));
  });
  it('eşlenmemiş zorunlu kolonu bildirir', () => {
    expect(validateImport(table, { occurred_at: 0 }, new Set()).errors.length).toBeGreaterThan(3);
  });
  it('dışa aktarmada formül enjeksiyonunu etkisizleştirir ve Türkçe karakter korur', () => {
    const csv = toCsv(['Ad'], [['=HYPERLINK("x")'], ['Şükrü; Çağ']]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Şükrü; Çağ"');
    expect(parseCsv(csv)).toEqual([['Ad'], [`'=HYPERLINK("x")`], ['Şükrü; Çağ']]);
  });
});

describe('MRZ ve OCR yardımcıları', () => {
  // ICAO 9303 örneği (sentetik) — TD1
  const sample = 'I<UTOD231458907<<<<<<<<<<<<<<<\n7408122F1204159UTO<<<<<<<<<<<6\nERIKSSON<<ANNA<MARIA<<<<<<<<<<';
  it('ICAO örnek MRZ satırlarını ve kontrol hanelerini çözer', () => {
    const r = parseTd1(sample)!;
    expect(r).toMatchObject({ documentNumber: 'D23145890', surname: 'ERIKSSON', givenNames: 'ANNA MARIA', birthDate: '1974-08-12', sex: 'F' });
    expect(r.checks).toMatchObject({ documentNumber: true, birthDate: true, expiryDate: true, composite: true, tckn: false });
    expect(checkDigit('740812')).toBe('2');
  });
  it('gerçek OCR gürültüsüne (0/O karışıklığı, İ, fazladan karakter) dayanıklıdır', () => {
    // Tesseract.js'in sentetik MRZ görüntüsünden ürettiği ham metin (tarayıcıda alındı)
    const noisy = 'I<UT0D231458907<<<<<<<<<<<<<<z\n7408122F1204159UT0<<<<<<<<<<<6\nERIİIKSSON<<ANNA<MARLA<<<<<<<<<<\n';
    const r = parseTd1(noisy)!;
    expect(r).toMatchObject({ documentNumber: 'D23145890', issuingState: 'UTO', nationality: 'UTO', birthDate: '1974-08-12' });
    expect(r.checks.documentNumber && r.checks.birthDate && r.checks.expiryDate).toBe(true);
    expect(r.surname).toMatch(/^ERI+KSSON$/);
  });
  it('OCR metninden yalnızca sağlaması geçerli TCKN adaylarını çıkarır', () => {
    expect(tcknCandidates('No 10000000146 ve 12345678901')).toEqual(['10000000146']);
  });
});

describe('ZIP ve tarih yardımcıları', () => {
  it('CRC32 bilinen değeri üretir ve ZIP imzaları doğrudur', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const zip = createZip([{ name: 'rapor/Şube.txt', data: new TextEncoder().encode('Türkçe') }]);
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(() => createZip([{ name: '../x', data: new Uint8Array() }])).toThrow();
  });
  it('ŞİB iç takip son tarihi: 10 iş günü, hafta sonu ve 29 Ekim atlanır', () => {
    // 23 Ekim 2026 Cuma → 26,27,28,30 Ekim + 2,3,4,5,6,9 Kasım (29 Ekim tatil) = 9 Kasım 2026
    expect(istanbulDate(addBusinessDays('2026-10-23T10:00:00+03:00', 10))).toBe('2026-11-09');
  });
});
