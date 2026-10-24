import { z } from 'zod';
import type { PublicPolicy } from './types';
import geography from './geography.json';
export function fileSelectionError(
  file: { name: string; type: string; size: number },
  maxMB: number,
) {
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    pdf: 'application/pdf',
  };
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (!types[extension] || types[extension] !== file.type)
    return 'Dosya uzantısı ve türü eşleşmeli: JPG, PNG veya PDF seçin.';
  if (file.size === 0) return 'Boş dosya yüklenemez.';
  if (file.size > maxMB * 1024 * 1024) return `Dosya boyutu en fazla ${maxMB} MB olabilir.`;
  return '';
}
export const provinces = geography as Record<string, string[]>;
export function validTckn(value: string) {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const n = [...value].map(Number);
  return (
    ((n[0] + n[2] + n[4] + n[6] + n[8]) * 7 - (n[1] + n[3] + n[5] + n[7]) + 100) % 10 === n[9] &&
    n.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === n[10]
  );
}
export function validVkn(value: string) {
  if (!/^\d{10}$/.test(value) || /^0+$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 9).reduce((sum, d, i) => {
    const a = (d + 9 - i) % 10;
    const b = (a * 2 ** (9 - i)) % 9;
    return sum + (a === 0 ? 0 : b === 0 ? 9 : b);
  }, 0);
  return (10 - (sum % 10)) % 10 === digits[9];
}
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter girin.`)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), 'Geçersiz karakter.');
export function applicationSchema(policy: Pick<PublicPolicy, 'required'>) {
  return z
    .object({
      kind: z.enum(['individual', 'corporate']),
      identityNumber: text(11),
      identityType: text(60),
      name: text(160),
      province: text(60),
      district: text(60),
      neighborhood: text(100),
      phone: text(24),
      email: text(254),
      address: text(600),
      nationality: text(80),
      occupation: text(100),
      amount: text(16),
      noticeRead: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const error = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });
      for (const field of policy.required)
        if (!v[field as keyof typeof v]) error(field, 'Bu alan zorunludur.');
      if (
        v.identityNumber &&
        !(v.kind === 'individual' ? validTckn(v.identityNumber) : validVkn(v.identityNumber))
      )
        error(
          'identityNumber',
          v.kind === 'individual' ? 'Geçerli bir TCKN girin.' : 'Geçerli bir vergi numarası girin.',
        );
      if (v.phone && !/^(?:\+90|0)?5\d{9}$/.test(v.phone.replace(/[\s()-]/g, '')))
        error('phone', 'Geçerli bir Türkiye cep telefonu girin.');
      if (v.email && !z.email().safeParse(v.email).success)
        error('email', 'Geçerli bir e-posta girin.');
      if (v.province && !provinces[v.province]) error('province', 'Listeden bir il seçin.');
      if (v.district && !provinces[v.province]?.includes(v.district))
        error('district', 'Seçtiğiniz ile bağlı bir ilçe seçin.');
      if (v.neighborhood && v.neighborhood.length < 2)
        error('neighborhood', 'En az 2 karakter girin.');
      if (v.name && v.name.length < 3) error('name', 'En az 3 karakter girin.');
      if (v.address && v.address.length < 10) error('address', 'En az 10 karakter girin.');
      if (
        v.amount &&
        (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(v.amount) || Number(v.amount.replace(',', '.')) <= 0)
      )
        error('amount', 'Sıfırdan büyük bir TRY tutarı girin.');
      if (!v.noticeRead) error('noticeRead', 'Aydınlatma metnini okuduğunuzu belirtin.');
    });
}
export function maskIdentity(value: string) {
  return value.length > 4 ? `${'*'.repeat(value.length - 4)}${value.slice(-4)}` : '';
}
