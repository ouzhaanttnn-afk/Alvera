import 'server-only';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit } from './audit';
import { raporConfig } from './config';
import { AppError, forbidden } from './errors';
import { decryptBlob, encryptBlob, sha256 } from './keys';
import type { Ctx } from './session';
import { blobStore } from './storage';

export const DOCUMENT_KINDS = {
  kimlik_belgesi: 'Kimlik belgesi kopyası', vekaletname: 'Vekaletname', 'imza_sirküleri': 'İmza sirküleri', fatura: 'Fatura/fiş',
  odeme_dekontu: 'Ödeme dekontu', vergi_levhasi: 'Vergi levhası', ticaret_sicil: 'Ticaret sicil belgesi', ic_inceleme: 'İç inceleme belgesi', diger: 'Diğer',
} as const;

const MAGIC: [string, (b: Uint8Array) => boolean][] = [
  ['application/pdf', (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d],
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)],
  ['image/webp', (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'],
];

/** Dosya türü, beyan edilen türden değil içerikten (imza baytları) belirlenir. */
export function detectMime(data: Uint8Array): string | null {
  return MAGIC.find(([, test]) => data.length > 12 && test(data))?.[0] || null;
}

export const uploadSchema = z.object({
  kind: z.enum(Object.keys(DOCUMENT_KINDS) as [keyof typeof DOCUMENT_KINDS]),
  title: z.string().trim().min(2, 'Belge başlığı gerekli.').max(200),
  customer_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  transaction_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  case_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  supersedes_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
});

export async function uploadDocument(ctx: Ctx, input: unknown, data: Uint8Array) {
  ctx.need('documents.upload');
  const v = uploadSchema.parse(input);
  if (!v.customer_id && !v.transaction_id && !v.case_id) throw new AppError('NO_RELATION', 'Belge bir müşteri, işlem veya incelemeyle ilişkilendirilmelidir.');
  if (v.case_id) ctx.need('cases.manage');
  if (data.length === 0 || data.length > raporConfig().maxUploadBytes) throw new AppError('FILE_SIZE', 'Dosya boş olamaz ve en fazla 10 MB olabilir.');
  const mime = detectMime(data);
  if (!mime) throw new AppError('FILE_TYPE', 'Yalnızca PDF, JPEG, PNG veya WEBP içeriği kabul edilir.');
  const org = ctx.org.organizationId;
  const hash = sha256(data);
  return ctx.db(async (sql) => {
    let version = 1;
    if (v.supersedes_id) {
      const prev = (await sql.query<{ version: number }>('select version from masak.documents where id = $1 and organization_id = $2 and not superseded', [v.supersedes_id, org]))[0];
      if (!prev) throw new AppError('INVALID_VERSION', 'Yeni versiyonu yüklenecek belge bulunamadı veya zaten güncellenmiş.');
      version = prev.version + 1;
    }
    const doc = (
      await sql.query<{ id: string }>(
        `insert into masak.documents (organization_id, customer_id, transaction_id, case_id, kind, title, mime, size_bytes, sha256, version, supersedes_id, confidential, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, masak.uid()) returning id`,
        [org, v.customer_id || null, v.transaction_id || null, v.case_id || null, v.case_id ? 'ic_inceleme' : v.kind, v.title, mime, data.length, hash, version, v.supersedes_id || null, Boolean(v.case_id)],
      )
    )[0];
    const key = `${org}/${randomBytes(32).toString('hex')}`;
    await blobStore().put(key, encryptBlob(data, `doc:${doc.id}`));
    await sql.query('select masak.register_blob($1, $2)', [doc.id, key]);
    if (v.supersedes_id) await sql.query('update masak.documents set superseded = true where id = $1', [v.supersedes_id]);
    await audit(sql, org, 'document.uploaded', 'documents', doc.id, { kind: v.kind, version, sha256: hash }, Boolean(v.case_id));
    if (v.case_id)
      await sql.query(`insert into masak.risk_case_events (organization_id, case_id, actor_id, kind, note) values ($1, $2, masak.uid(), 'document', 'Belge eklendi.')`, [org, v.case_id]);
    return { id: doc.id, version };
  });
}

/** İndirme: yetki veritabanı fonksiyonunda kontrol edilir ve erişim denetim izine yazılır. */
export async function readDocument(ctx: Ctx, id: string) {
  if (!ctx.can('documents.download')) throw forbidden('Belge indirme yetkiniz yok.');
  const meta = await ctx.db(async (sql) => {
    try {
      return (await sql.query<{ storage_key: string; mime: string; title: string; sha256: string }>('select * from masak.authorize_document($1)', [id]))[0];
    } catch {
      throw forbidden('Belge indirme yetkiniz yok.');
    }
  });
  if (!meta) throw forbidden();
  const data = decryptBlob(await blobStore().get(meta.storage_key), `doc:${id}`);
  if (sha256(data) !== meta.sha256) throw new AppError('INTEGRITY', 'Belge bütünlük kontrolünden geçemedi.', 500);
  return { ...meta, data };
}

export async function listDocuments(ctx: Ctx, f: { q?: string; kind?: string }) {
  ctx.need('records.read');
  return ctx.db((sql) =>
    sql.query<Record<string, unknown>>(
      `select d.id, d.kind, d.title, d.mime, d.size_bytes, d.sha256, d.version, d.superseded, d.confidential, d.retention_until::text, d.legal_hold, d.deletion_status,
              d.created_at, p.full_name as uploaded_by_name, c.display_name as customer_name, t.number as transaction_number
         from masak.documents d left join masak.profiles p on p.id = d.uploaded_by left join masak.customers c on c.id = d.customer_id
         left join masak.transactions t on t.id = d.transaction_id
        where d.organization_id = $1 and ($2 = '' or d.title ilike '%' || $2 || '%' or c.display_name ilike '%' || $2 || '%' or t.number ilike '%' || $2 || '%')
          and ($3 = '' or d.kind = $3)
        order by d.created_at desc limit 200`,
      [ctx.org.organizationId, (f.q || '').trim(), f.kind || ''],
    ),
  );
}

/** Silme doğrudan yapılmaz: değerlendirme talebi açılır; yasal saklama/istisna kontrolü yetkili kişi tarafından yapılır. */
export async function requestDeletionReview(ctx: Ctx, id: string) {
  ctx.need('documents.upload');
  return ctx.db(async (sql) => {
    await sql.query(`update masak.documents set deletion_status = 'review_requested' where id = $1 and organization_id = $2 and not legal_hold`, [id, ctx.org.organizationId]);
    await audit(sql, ctx.org.organizationId, 'document.deletion_review', 'documents', id, { status: 'review_requested' });
  });
}
