import 'server-only';
import { z } from 'zod';
import { toCsv } from '../csv';
import { formatDateTime } from '../dates';
import { createZip, type ZipEntry } from '../zip';
import { audit } from './audit';
import { AppError, forbidden } from './errors';
import { decryptBlob, sha256 } from './keys';
import { CONFIDENTIAL_NOTE, DISCLAIMER } from './pdf';
import { canGenerate, csvData, produceReport, type ReportCode } from './reports';
import type { Ctx } from './session';
import { blobStore } from './storage';

export const packageSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Başlangıç tarihi gerekli.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bitiş tarihi gerekli.'),
  include_documents: z.boolean().default(false),
  include_confidential: z.boolean().default(false),
});

/**
 * Denetim hazırlık paketi: yalnızca açık kullanıcı eylemiyle ve yetki kontrolüyle üretilir.
 * Gizli iç inceleme içeriği, yalnızca reports.confidential + cases.view izni olan kullanıcı açıkça isterse eklenir.
 */
export async function auditPackage(ctx: Ctx, input: unknown) {
  ctx.need('export.data');
  const v = packageSchema.parse(input);
  if (v.from > v.to) throw new AppError('INVALID_RANGE', 'Başlangıç tarihi bitiş tarihinden sonra olamaz.');
  if (v.include_documents) ctx.need('documents.download');
  if (v.include_confidential && !(ctx.can('reports.confidential') && ctx.can('cases.view'))) throw forbidden('Gizli iç değerlendirmeleri dışa aktarma yetkiniz yok.');
  const org = ctx.org.organizationId;
  return ctx.db(async (sql) => {
    const inner: Ctx = { ...ctx, db: (fn) => fn(sql) };
    const files: ZipEntry[] = [];
    const reportRefs: { code: string; reference: string; sha256: string }[] = [];
    const versions: unknown[] = [];
    const add = (name: string, data: Uint8Array | string) => files.push({ name, data: typeof data === 'string' ? new TextEncoder().encode(data) : data });

    const codes: ReportCode[] = ['G', 'E', 'F', 'A', 'I', ...(v.include_confidential ? (['H'] as ReportCode[]) : [])];
    for (const code of codes) {
      if (!canGenerate(ctx, code)) continue;
      const r = await produceReport(inner, sql, code, { from: v.from, to: v.to });
      add(`raporlar/${r.filename}`, r.bytes);
      reportRefs.push({ code, reference: r.reference, sha256: r.sha256 });
      versions.push(...r.versions);
    }
    add('veriler/islemler.csv', await csvData(inner, sql, 'transactions', v.from, v.to));
    add('veriler/musteriler-maskeli.csv', await csvData(inner, sql, 'customers', v.from, v.to));
    add('veriler/kural-uyarilari.csv', await csvData(inner, sql, 'alerts', v.from, v.to));
    if (ctx.can('audit.view')) {
      add('veriler/denetim-izi.csv', await csvData(inner, sql, 'audit', v.from, v.to));
      const changes = await sql.query<Record<string, unknown>>(
        `select v.entity_type, v.entity_id, v.version, v.operation, v.changed_at, p.full_name, v.snapshot->>'status' as status
           from masak.record_versions v left join masak.profiles p on p.id = v.changed_by
          where v.organization_id = $1 and v.changed_at >= ($2 || 'T00:00:00+03:00')::timestamptz and v.changed_at < (($3 || 'T00:00:00+03:00')::timestamptz + interval '1 day')
          order by v.id`, [org, v.from, v.to]);
      add('veriler/kayit-degisiklikleri.csv', toCsv(['Kayıt türü', 'Kayıt kimliği', 'Versiyon', 'İşlem', 'Zaman', 'Değiştiren', 'Durum'],
        changes.map((c) => [c.entity_type, c.entity_id, c.version, c.operation === 'insert' ? 'Oluşturma' : 'Değişiklik', formatDateTime(c.changed_at as Date), c.full_name || 'Sistem', c.status || ''])));
    }
    const docs = await sql.query<Record<string, unknown>>(
      `select d.id, d.title, d.kind, d.mime, d.sha256, d.version, d.superseded, d.confidential, d.created_at, c.display_name, t.number
         from masak.documents d left join masak.customers c on c.id = d.customer_id left join masak.transactions t on t.id = d.transaction_id
        where d.organization_id = $1 and (d.transaction_id is null or (t.occurred_at >= ($2 || 'T00:00:00+03:00')::timestamptz and t.occurred_at < (($3 || 'T00:00:00+03:00')::timestamptz + interval '1 day')))
          and ($4 or not d.confidential)
        order by d.created_at`, [org, v.from, v.to, v.include_confidential]);
    add('veriler/belge-envanteri.csv', toCsv(['Belge', 'Tür', 'Versiyon', 'Güncel', 'Müşteri', 'İşlem', 'Yükleme', 'SHA-256', 'Pakete eklendi'],
      docs.map((d) => [d.title, d.kind, d.version, d.superseded ? 'Hayır (eski versiyon)' : 'Evet', d.display_name || '', d.number || '', formatDateTime(d.created_at as Date), d.sha256, v.include_documents ? 'Evet' : 'Hayır'])));
    if (v.include_documents) {
      for (const d of docs) {
        const meta = (await sql.query<{ storage_key: string; sha256: string }>('select * from masak.authorize_document($1)', [d.id]))[0];
        const data = decryptBlob(await blobStore().get(meta.storage_key), `doc:${d.id}`);
        if (sha256(data) !== meta.sha256) throw new AppError('INTEGRITY', 'Bir belge bütünlük kontrolünden geçemedi; paket oluşturulmadı.', 500);
        const ext = d.mime === 'application/pdf' ? 'pdf' : d.mime === 'image/png' ? 'png' : d.mime === 'image/webp' ? 'webp' : 'jpg';
        add(`belgeler/${String(d.id)}-v${d.version}.${ext}`, data);
      }
    }
    const reference = (await sql.query<{ n: string }>('select masak.next_number($1, $2) as n', [org, 'report']))[0].n;
    add('BENIOKU.txt', [
      'ALVERA MASAK RAPORU — DENETİM HAZIRLIK PAKETİ', '', DISCLAIMER,
      v.include_confidential ? CONFIDENTIAL_NOTE : 'Bu paket gizli iç şüphe değerlendirmelerini içermez.', '',
      `Paket referansı: ${reference}`, `Dönem: ${v.from} – ${v.to}`, `Hazırlayan: ${ctx.user.fullName}`, `Oluşturma: ${formatDateTime(new Date())}`, '',
      'Bütünlük: manifest.json her dosyanın SHA-256 özetini içerir; manifest.sha256 dosyası manifestin özetidir.',
      'Kimlik numaraları maskelidir. Belge kopyaları yalnızca belge indirme yetkisi olan kullanıcı açıkça istediğinde eklenir.',
    ].join('\n') + '\n');
    const manifest = {
      package_reference: reference, organization: ctx.org.organizationName, generated_at: new Date().toISOString(), generated_by: ctx.user.fullName,
      range: { from: v.from, to: v.to }, include_documents: v.include_documents, include_confidential: v.include_confidential, disclaimer: DISCLAIMER,
      reports: reportRefs, files: files.map((f) => ({ path: f.name, bytes: f.data.length, sha256: sha256(f.data) })),
    };
    const manifestText = JSON.stringify(manifest, null, 2);
    const manifestHash = sha256(manifestText);
    add('manifest.json', manifestText);
    add('manifest.sha256', `${manifestHash}  manifest.json\n`);
    const zip = createZip(files);
    await sql.query(
      `insert into masak.report_exports (organization_id, report_type, format, reference, filters, record_count, record_versions, sha256, confidential, created_by)
       values ($1, 'ZIP', 'zip', $2, $3::jsonb, $4, $5::jsonb, $6, $7, masak.uid())`,
      [org, reference, JSON.stringify(v), files.length, JSON.stringify(versions), manifestHash, v.include_confidential],
    );
    await audit(sql, org, 'audit_package.exported', 'report_exports', null, { reference, files: files.length, manifest: manifestHash, documents: v.include_documents, confidential: v.include_confidential }, v.include_confidential);
    return { zip, reference, manifestHash, filename: `${reference}-denetim-paketi.zip`, manifest };
  });
}
