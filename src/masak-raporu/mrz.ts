// Kimlik kartı arka yüzündeki MRZ (ICAO 9303 TD1, 3 × 30 karakter) çözümleyicisi.
// OCR çıktısı yalnızca form önerisidir; personel belgeyle karşılaştırıp onaylamadan teyit sayılmaz.
import { validTckn } from './ids';

export type MrzResult = {
  documentNumber: string;
  nationality: string;
  issuingState: string;
  birthDate: string | null;
  expiryDate: string | null;
  sex: string;
  surname: string;
  givenNames: string;
  personalNumber: string;
  checks: { documentNumber: boolean; birthDate: boolean; expiryDate: boolean; composite: boolean; tckn: boolean };
};

const WEIGHTS = [7, 3, 1];
function value(c: string) {
  if (c === '<') return 0;
  if (/\d/.test(c)) return Number(c);
  return c.charCodeAt(0) - 55;
}
export function checkDigit(s: string) {
  return String([...s].reduce((sum, c, i) => sum + value(c) * WEIGHTS[i % 3], 0) % 10);
}

// Harf olması gereken alanlarda tipik OCR karışıklıkları (0→O, 1→I, 5→S, 8→B, 2→Z).
const letters = (v: string) => v.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B').replace(/2/g, 'Z');

function normalizeLine(line: string) {
  return line
    .replace(/[İ]/g, 'I')
    .toUpperCase()
    .replace(/[«‹]/g, '<')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9<]/g, '');
}

function mrzDate(yymmdd: string, kind: 'birth' | 'expiry'): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const now = new Date().getUTCFullYear() % 100;
  const century = kind === 'birth' ? (yy > now ? 1900 : 2000) : 2000;
  const iso = `${century + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** OCR metninden TD1 MRZ satırlarını bulur ve çözer. Bulamazsa null. */
export function parseTd1(text: string): MrzResult | null {
  const lines = text.split(/\r?\n/).map(normalizeLine).filter((l) => l.length >= 28);
  for (let i = 0; i + 2 < lines.length; i++) {
    const [a, b, c] = [lines[i], lines[i + 1], lines[i + 2]].map((l) => l.padEnd(30, '<').slice(0, 30));
    if (!/^[AIC][A-Z0-9<][A-Z0-9<]{3}/.test(a) || !/^\d{6}/.test(b)) continue;
    const documentNumber = a.slice(5, 14).replace(/<+$/, '');
    const optional1 = a.slice(15, 30);
    const [surname, ...given] = letters(c).split('<<');
    const personalNumber = optional1.replace(/</g, '');
    const composite = a.slice(5, 30) + b.slice(0, 7) + b.slice(8, 15) + b.slice(18, 29);
    return {
      documentNumber,
      issuingState: letters(a.slice(2, 5)).replace(/</g, ''),
      nationality: letters(b.slice(15, 18)).replace(/</g, ''),
      birthDate: mrzDate(b.slice(0, 6), 'birth'),
      expiryDate: mrzDate(b.slice(8, 14), 'expiry'),
      sex: b[7] === '<' ? '' : b[7],
      surname: surname.replace(/</g, ' ').trim(),
      givenNames: given.join(' ').replace(/</g, ' ').replace(/\s+/g, ' ').trim(),
      personalNumber,
      checks: {
        documentNumber: checkDigit(a.slice(5, 14)) === a[14],
        birthDate: checkDigit(b.slice(0, 6)) === b[6],
        expiryDate: checkDigit(b.slice(8, 14)) === b[14],
        composite: checkDigit(composite) === b[29],
        tckn: validTckn(personalNumber),
      },
    };
  }
  return null;
}

/** OCR metnindeki, sağlama algoritmasını geçen 11 haneli TCKN adayları (biçim kontrolüdür, kimlik doğrulaması değildir). */
export function tcknCandidates(text: string): string[] {
  return [...new Set((text.match(/\b[1-9]\d{10}\b/g) || []).filter(validTckn))];
}

export function maskIdentifier(value: string): string {
  const v = value.replace(/\s/g, '');
  if (v.length <= 4) return '•'.repeat(v.length);
  return `${v.slice(0, 2)}${'•'.repeat(v.length - 4)}${v.slice(-2)}`;
}
