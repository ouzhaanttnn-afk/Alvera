export class AppError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public status = 400,
  ) {
    super(code);
  }
}
export const forbidden = (msg = 'Bu işlem için yetkiniz yok.') => new AppError('FORBIDDEN', msg, 403);
export const notFound = (msg = 'Kayıt bulunamadı.') => new AppError('NOT_FOUND', msg, 404);

/** Kullanıcıya gösterilecek güvenli hata metni; ayrıntı (kişisel veri dahil) loglanmaz. */
export function safeMessage(e: unknown): string {
  if (e instanceof AppError) return e.userMessage;
  const m = e instanceof Error ? e.message : '';
  if (/IMMUTABLE|TRANSACTION_CLOSED/.test(m)) return 'Tamamlanmış kayıt değiştirilemez; iptal veya düzeltme kaydı oluşturun.';
  if (/FORBIDDEN|row-level security|permission denied|42501/i.test(m)) return 'Bu işlem için yetkiniz yok.';
  if (/LAST_OWNER/.test(m)) return 'İşletmede en az bir aktif işletme sahibi kalmalıdır.';
  if (/OWNER_REQUIRED/.test(m)) return 'Bu değişikliği yalnızca işletme sahibi yapabilir.';
  if (/RULE_APPROVAL_REQUIRED/.test(m)) return 'Kuralı onaylama yetkiniz yok.';
  if (/check constraint|violates/i.test(m)) return 'Girilen bilgiler kayıt kurallarına uymuyor. Zorunlu alanları kontrol edin.';
  console.error(JSON.stringify({ event: 'MASAK_RAPORU_ERROR', code: m.slice(0, 40).replace(/[^A-Z_]/g, '') || 'UNKNOWN' }));
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
}
