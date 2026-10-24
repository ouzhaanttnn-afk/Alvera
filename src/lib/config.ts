import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PublicPolicy } from './types';
const defaultRequired = [
  'identityNumber',
  'identityType',
  'name',
  'province',
  'district',
  'neighborhood',
  'phone',
  'address',
  'nationality',
  'occupation',
  'amount',
];
export function config(scope: 'intake' | 'admin' = 'intake') {
  const local =
    process.env.APP_MODE === 'local' ||
    (!process.env.APP_MODE && process.env.NODE_ENV !== 'production');
  if (local && process.env.NODE_ENV === 'production') throw new Error('LOCAL_MODE_FORBIDDEN');
  const required = process.env.REQUIRED_FIELDS
    ? (JSON.parse(process.env.REQUIRED_FIELDS) as string[])
    : defaultRequired;
  if (!Array.isArray(required) || required.some((v) => ![...defaultRequired, 'email'].includes(v)))
    throw new Error('INVALID_REQUIRED_FIELDS');
  const c = {
    local,
    required,
    url: process.env.APP_URL || 'http://127.0.0.1:3000',
    dataDir: resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || '.local'),
    documents: process.env.DOCUMENTS_ENABLED === 'true',
    signature: process.env.SIGNATURE_ENABLED === 'true',
    residence: process.env.RESIDENCE_DOCUMENT_ENABLED === 'true',
    residenceRequired: process.env.RESIDENCE_DOCUMENT_REQUIRED === 'true',
    maxUploadMB: Number(process.env.MAX_UPLOAD_MB || 5),
    retentionDays: Number(process.env.RETENTION_DAYS || 365),
    siteKey: process.env.TURNSTILE_SITE_KEY || '',
    noticeVersion: process.env.PRIVACY_NOTICE_VERSION || 'development-v1',
  };
  if (c.residenceRequired && !c.residence) throw new Error('INVALID_RESIDENCE_POLICY');
  if (
    !Number.isInteger(c.retentionDays) ||
    c.retentionDays < 1 ||
    !Number.isFinite(c.maxUploadMB) ||
    c.maxUploadMB < 1 ||
    c.maxUploadMB > 10
  )
    throw new Error('INVALID_LIMITS');
  if (!local && scope === 'intake' && process.env.MASAK_INTAKE_ENABLED !== 'true') throw new Error('INTAKE_CLOSED');
  if (!local) {
    const baseKeys = [
      'APP_URL',
      'DATA_ENCRYPTION_KEY',
      'TOKEN_SECRET',
      'CRON_SECRET',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];
    const intakeKeys = [
      'RESEND_API_KEY',
      'EMAIL_FROM',
      'ADMIN_EMAIL',
      'TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
      'PRIVACY_NOTICE_PATH',
      'PRIVACY_NOTICE_VERSION',
      'DATA_CONTROLLER_NAME',
    ];
    for (const key of [...baseKeys, ...(scope === 'intake' ? intakeKeys : [])])
      if (!process.env[key]) throw new Error(`CONFIG_MISSING_${key}`);
    if (!c.url.startsWith('https://')) throw new Error('HTTPS_REQUIRED');
    if (scope === 'intake' && process.env.LEGAL_REVIEW_APPROVED !== 'true')
      throw new Error('PRODUCTION_REVIEW_REQUIRED');
    for (const key of ['DATA_ENCRYPTION_KEY', 'TOKEN_SECRET', 'CRON_SECRET'])
      if (Buffer.from(process.env[key]!, 'base64').length !== 32) throw new Error(`INVALID_${key}`);
    if (scope === 'intake' && (c.documents || c.signature || c.residence)) {
      if (!process.env.FILE_SCAN_URL?.startsWith('https://') || !process.env.FILE_SCAN_TOKEN)
        throw new Error('SCANNER_REQUIRED');
    }
    if (scope === 'intake') readFileSync(process.env.PRIVACY_NOTICE_PATH!, 'utf8');
  }
  return c;
}
export function publicPolicy(): PublicPolicy {
  const {
    local,
    required,
    documents,
    signature,
    residence,
    residenceRequired,
    maxUploadMB,
    siteKey,
    noticeVersion,
  } = config();
  return {
    local,
    required,
    documents,
    signature,
    residence,
    residenceRequired,
    maxUploadMB,
    siteKey,
    noticeVersion,
  };
}
export function privacyNotice() {
  config();
  return process.env.PRIVACY_NOTICE_PATH
    ? readFileSync(process.env.PRIVACY_NOTICE_PATH, 'utf8')
    : 'GELİŞTİRME ORTAMI — Yalnızca sentetik veri kullanın. Bu metin canlı kullanım için bir aydınlatma metni değildir. Veri sorumlusu, işleme amaçları, hukuki dayanak, aktarım, saklama süreleri, ilgili kişi hakları ve başvuru kanalları yetkili hukuk danışmanı tarafından tamamlanmalıdır. Aşağıdaki kutu yalnızca bu açıklamanın okunduğunu kaydeder; açık rıza değildir.';
}

// The hosted preview may show the form while every intake API remains fail-closed.
export function pageConfiguration(): { policy: PublicPolicy; notice: string } {
  try {
    return { policy: publicPolicy(), notice: privacyNotice() };
  } catch (error) {
    if (process.env.VERCEL_ENV !== 'preview') throw error;
    return {
      policy: {
        local: false,
        previewOnly: true,
        documents: true,
        signature: true,
        residence: true,
        residenceRequired: false,
        required: defaultRequired,
        maxUploadMB: 5,
        siteKey: '',
        noticeVersion: 'preview-disabled',
      },
      notice:
        'Bu bir tasarım ve kullanım önizlemesidir. Başvuru gönderimi kapalıdır; bilgiler kaydedilmez veya e-posta gönderilmez. Yalnızca sentetik veri kullanın. Canlı aydınlatma metni ve servis yapılandırmaları henüz tamamlanmamıştır.',
    };
  }
}
