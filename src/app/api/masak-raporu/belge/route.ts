import { raporConfig } from '@/masak-raporu/server/config';
import { uploadDocument } from '@/masak-raporu/server/documents';
import { AppError } from '@/masak-raporu/server/errors';
import { handle } from '@/masak-raporu/server/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(
    req,
    async (ctx) => {
      if (req.headers.get('x-requested-with') !== 'masak-raporu') throw new AppError('BAD_REQUEST', 'Geçersiz istek.', 400);
      if (Number(req.headers.get('content-length') || 0) > raporConfig().maxUploadBytes + 64 * 1024) throw new AppError('FILE_SIZE', 'Dosya en fazla 10 MB olabilir.', 413);
      const fd = await req.formData();
      const file = fd.get('file');
      if (!(file instanceof File)) throw new AppError('NO_FILE', 'Dosya seçin.', 400);
      const meta = Object.fromEntries(['kind', 'title', 'customer_id', 'transaction_id', 'case_id', 'supersedes_id'].map((k) => [k, String(fd.get(k) || '')]));
      const out = await uploadDocument(ctx, meta, new Uint8Array(await file.arrayBuffer()));
      return Response.json(out);
    },
    { mutating: true, json: true },
  );
}
