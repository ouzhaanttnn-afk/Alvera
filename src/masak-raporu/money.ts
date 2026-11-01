// Para değerleri her yerde tam kuruş (bigint) olarak tutulur; kayan nokta kullanılmaz.

export class MoneyError extends Error {}

/** "1.234,56", "1234,56", "1234.56", "1234" → kuruş. Üçten fazla ondalık veya belirsiz biçim reddedilir. */
export function parseAmount(input: string): bigint {
  let s = String(input).trim().replace(/\s|TL|₺/gi, '');
  if (!s) throw new MoneyError('Tutar boş.');
  const negative = s.startsWith('-');
  if (negative) throw new MoneyError('Tutar negatif olamaz.');
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') < s.lastIndexOf('.')) throw new MoneyError('Tutar biçimi belirsiz. Örnek: 1.234,56');
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s)) throw new MoneyError('Tutar biçimi hatalı. Örnek: 1.234,56');
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    if (!/^\d+(,\d{1,2})?$/.test(s)) throw new MoneyError('Tutar biçimi hatalı. Örnek: 1234,56');
    s = s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new MoneyError('Tutar biçimi hatalı. En fazla iki ondalık hane kullanın.');
  }
  const [whole, frac = ''] = s.split('.');
  const kurus = BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
  if (kurus > 9_000_000_000_000_000n) throw new MoneyError('Tutar çok büyük.');
  return kurus;
}

/** Ondalık metni (en fazla `scale` hane) tam sayıya ölçekler: ("12,5", 3) → 12500n */
export function parseScaled(input: string, scale: number, label = 'Değer'): bigint {
  const s = String(input).trim().replace(',', '.');
  const re = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!re.test(s)) throw new MoneyError(`${label} biçimi hatalı (en fazla ${scale} ondalık hane).`);
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt((frac + '0'.repeat(scale)).slice(0, scale));
}

export function scaledToString(value: bigint, scale: number): string {
  const base = 10n ** BigInt(scale);
  const frac = (value % base).toString().padStart(scale, '0');
  return `${value / base}.${frac}`;
}

/** kuruş × kur (6 ondalık) → kuruş, yarım yukarı yuvarlama. */
export function convertWithRate(kurus: bigint, rate: string): bigint {
  const r = parseScaled(rate, 6, 'Kur');
  if (r <= 0n) throw new MoneyError('Kur sıfırdan büyük olmalı.');
  return (kurus * r + 500_000n) / 1_000_000n;
}

/** birim fiyat (kuruş) × adet → kuruş */
export function lineTotal(unitKurus: bigint, quantity: number): bigint {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new MoneyError('Adet pozitif tam sayı olmalı.');
  return unitKurus * BigInt(quantity);
}

export function formatKurus(kurus: bigint | number | string, currency = 'TRY'): string {
  const v = BigInt(kurus);
  const whole = (v / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (v % 100n).toString().padStart(2, '0');
  return `${whole},${frac} ${currency === 'TRY' ? 'TL' : currency}`;
}

export function kurusFromTl(tl: number): bigint {
  if (!Number.isInteger(tl)) throw new MoneyError('Yalnızca tam TL değerleri.');
  return BigInt(tl) * 100n;
}
